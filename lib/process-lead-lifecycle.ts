import { type LifecycleProcessingResult } from './lead-lifecycle';
import {
  automaticFollowUpRules,
  getLifecycleReferenceAt,
  hasInteractionSincePostFollowUp,
  isAutomaticFollowUpDue,
  isProtectedFromAutomaticDiscard
} from './crm/lifecycle-policy';
import { createSystemCrmActor } from './crm/actor';
import { withCrmActivityActor } from './crm/commands';

const systemActor = createSystemCrmActor();
const teamOwnerId = systemActor.id;
const postFollowUpExpiryStages = ['NEW', 'CONTACTED', 'INTEREST', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING', 'FOLLOW_UP', 'NO_RESPONSE'] as const;
const systemNote = 'Atualização automática por inatividade.';

type LifecycleLead = {
  id: string;
  version: number;
  stage: string;
  stageEnteredAt: Date;
  postFollowUpAt: Date | null;
  discardedAt: Date | null;
  lastMeaningfulInteractionAt: Date | null;
  meetingAt: Date | null;
};

type LeadWhere = {
  id?: string;
  version?: number;
  stage?: string | { in: readonly string[] };
  stageEnteredAt?: Date | { lte: Date };
  postFollowUpAt?: Date | null | { lte: Date };
  discardedAt?: { lte: Date };
};

type LeadUpdate = Omit<Partial<LifecycleLead>, 'version'> & { version?: number | { increment: number } };
type PurgeWhere = {
  OR: { id: string; version: number; stage: 'DISCARDED'; discardedAt: { lte: Date } }[];
};

export interface LifecycleTransaction {
  crmSettings: { findUnique(args: { where: { id: string }; select: { followUpDelayDays: true } }): Promise<{ followUpDelayDays: number } | null> };
  lead: {
    findMany(args: { where: LeadWhere; select: Record<string, true> }): Promise<LifecycleLead[]>;
    updateMany(args: { where: LeadWhere; data: LeadUpdate }): Promise<{ count: number }>;
    deleteMany(args: { where: PurgeWhere }): Promise<{ count: number }>;
  };
  activity: {
    findFirst(args: { where: { leadId: string }; orderBy: { createdAt: 'desc' }; select: { actorId: true } }): Promise<{ actorId: string } | null>;
    create(args: { data: { leadId: string; actorId: string; origin: string; type: string; note: string } }): Promise<unknown>;
  };
  followUp: {
    updateMany(args: { where: { leadId: string; state: 'PENDING' }; data: { state: 'CANCELLED'; cancelledAt: Date; cancelledById: string } }): Promise<{ count: number }>;
    create(args: { data: { leadId: string; dueDate: Date; ownerId: string; returnStage: string; note: string } }): Promise<unknown>;
  };
  stageHistory: { create(args: { data: { leadId: string; actorId: string; fromStage: string; toStage: string } }): Promise<unknown> };
  cadenceEnrollment?: { findFirst(args: { where: { leadId: string; status: { in: readonly string[] } }; select: { id: true } }): Promise<{ id: string } | null> };
  proposalVersion?: { findFirst(args: { where: { status: 'APPROVED'; proposal: { leadId: string } }; select: { id: true } }): Promise<{ id: string } | null> };
}

export interface LifecycleDatabase extends LifecycleTransaction {
  $transaction<T>(callback: (tx: LifecycleTransaction) => Promise<T>): Promise<T>;
}

function assertValidNow(now: Date) {
  if (!Number.isFinite(now.valueOf())) throw new RangeError('A data atual do processamento deve ser válida.');
}

function snapshotWhere(lead: LifecycleLead): LeadWhere {
  return { id: lead.id, version: lead.version, stage: lead.stage, stageEnteredAt: lead.stageEnteredAt, postFollowUpAt: lead.postFollowUpAt };
}

export async function processLeadLifecycle(database: LifecycleDatabase, now: Date): Promise<LifecycleProcessingResult> {
  assertValidNow(now);
  const discardCutoff = new Date(now.valueOf() - 5 * 24 * 60 * 60 * 1000);
  let movedToFollowUp = 0;
  let discardedForInactivity = 0;

  const discardCandidates = await database.lead.findMany({
    where: { stage: { in: postFollowUpExpiryStages }, postFollowUpAt: { lte: discardCutoff } },
    select: { id: true, version: true, stage: true, stageEnteredAt: true, postFollowUpAt: true, discardedAt: true, lastMeaningfulInteractionAt: true, meetingAt: true }
  });
  for (const candidate of discardCandidates) {
    const [activeCadence, approvedProposal] = await Promise.all([
      database.cadenceEnrollment?.findFirst({ where: { leadId: candidate.id, status: { in: ['ACTIVE', 'WAITING_HUMAN'] } }, select: { id: true } }),
      database.proposalVersion?.findFirst({ where: { status: 'APPROVED', proposal: { leadId: candidate.id } }, select: { id: true } })
    ]);
    if (isProtectedFromAutomaticDiscard({
      stage: candidate.stage,
      meetingAt: candidate.meetingAt,
      postFollowUpAt: candidate.postFollowUpAt,
      lastMeaningfulInteractionAt: candidate.lastMeaningfulInteractionAt,
      hasActiveCadence: Boolean(activeCadence),
      hasApprovedProposal: Boolean(approvedProposal),
      now
    })) {
      if (hasInteractionSincePostFollowUp(candidate)) {
        await database.$transaction((tx) => tx.lead.updateMany({
          where: snapshotWhere(candidate), data: { postFollowUpAt: null, version: { increment: 1 } }
        }));
      }
      continue;
    }
    const discarded = await database.$transaction(async (tx) => {
      const [cadenceStillActive, proposalStillApproved] = await Promise.all([
        tx.cadenceEnrollment?.findFirst({ where: { leadId: candidate.id, status: { in: ['ACTIVE', 'WAITING_HUMAN'] } }, select: { id: true } }),
        tx.proposalVersion?.findFirst({ where: { status: 'APPROVED', proposal: { leadId: candidate.id } }, select: { id: true } })
      ]);
      if (cadenceStillActive || proposalStillApproved) return false;
      const changed = await tx.lead.updateMany({
        where: snapshotWhere(candidate),
        data: { stage: 'DISCARDED', stageEnteredAt: now, discardedAt: now, postFollowUpAt: null, version: { increment: 1 } }
      });
      if (changed.count !== 1) return false;
      await tx.followUp.updateMany({
        where: { leadId: candidate.id, state: 'PENDING' },
        data: { state: 'CANCELLED', cancelledAt: now, cancelledById: teamOwnerId }
      });
      await tx.stageHistory.create({ data: { leadId: candidate.id, actorId: teamOwnerId, fromStage: candidate.stage, toStage: 'DISCARDED' } });
      await tx.activity.create({ data: withCrmActivityActor(systemActor, { leadId: candidate.id, type: 'DISCARDED', note: 'Lead descartado automaticamente por inatividade.' }) });
      return true;
    });
    if (discarded) discardedForInactivity += 1;
  }

  for (const rule of automaticFollowUpRules) {
    const followUpCutoff = new Date(now.valueOf() - rule.delayDays * 24 * 60 * 60 * 1000);
    const dueCandidates = await database.lead.findMany({
      where: { stage: rule.stage, stageEnteredAt: { lte: followUpCutoff }, postFollowUpAt: null },
      select: { id: true, version: true, stage: true, stageEnteredAt: true, postFollowUpAt: true, discardedAt: true, lastMeaningfulInteractionAt: true, meetingAt: true }
    });
    for (const candidate of dueCandidates) {
      const moved = await database.$transaction(async (tx) => {
        const referenceAt = getLifecycleReferenceAt(candidate.stageEnteredAt, candidate.lastMeaningfulInteractionAt);
        const dueAt = new Date(referenceAt.valueOf() + rule.delayDays * 24 * 60 * 60 * 1000);
        if (!isAutomaticFollowUpDue({
          stage: candidate.stage,
          stageEnteredAt: candidate.stageEnteredAt,
          lastMeaningfulInteractionAt: candidate.lastMeaningfulInteractionAt,
          postFollowUpAt: candidate.postFollowUpAt,
          delayDays: rule.delayDays,
          now
        })) return false;
        const changed = await tx.lead.updateMany({
          where: snapshotWhere(candidate),
          data: { stage: 'FOLLOW_UP', stageEnteredAt: now, postFollowUpAt: null, discardedAt: null, version: { increment: 1 } }
        });
        if (changed.count !== 1) return false;
        const latestActivity = await tx.activity.findFirst({
          where: { leadId: candidate.id },
          orderBy: { createdAt: 'desc' },
          select: { actorId: true }
        });
        const actorId = latestActivity?.actorId || teamOwnerId;
        await tx.followUp.updateMany({
          where: { leadId: candidate.id, state: 'PENDING' },
          data: { state: 'CANCELLED', cancelledAt: now, cancelledById: teamOwnerId }
        });
        await tx.followUp.create({ data: {
          leadId: candidate.id,
          dueDate: dueAt,
          ownerId: actorId,
          returnStage: candidate.stage,
          note: 'Retorno agendado automaticamente por inatividade.'
        } });
        await tx.stageHistory.create({ data: { leadId: candidate.id, actorId: teamOwnerId, fromStage: candidate.stage, toStage: 'FOLLOW_UP' } });
        await tx.activity.create({ data: withCrmActivityActor(systemActor, { leadId: candidate.id, type: 'FOLLOW_UP_SCHEDULED', note: systemNote }) });
        return true;
      });
      if (moved) movedToFollowUp += 1;
    }
  }

  // Discards remain reversible in the CRM; routine lifecycle processing never hard-deletes commercial history.
  return { movedToFollowUp, discardedForInactivity, permanentlyDeleted: 0 };
}
