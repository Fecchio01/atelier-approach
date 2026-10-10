import { getFollowUpDelayDays } from './commercial-settings';
import { getFollowUpDueAt, isPurgeEligible, type LifecycleProcessingResult } from './lead-lifecycle';

const teamOwnerId = '__team__';
const activeStages = ['NEW', 'CONTACTED', 'INTEREST', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING'] as const;
const postFollowUpExpiryStages = [...activeStages, 'FOLLOW_UP', 'NO_RESPONSE'] as const;
const systemNote = 'Atualização automática por inatividade.';

type LifecycleLead = {
  id: string;
  stage: string;
  stageEnteredAt: Date;
  postFollowUpAt: Date | null;
  discardedAt: Date | null;
};

type LeadWhere = {
  id?: string;
  stage?: string | { in: readonly string[] };
  stageEnteredAt?: Date | { lte: Date };
  postFollowUpAt?: Date | null | { lte: Date };
  discardedAt?: { lte: Date };
};

export interface LifecycleTransaction {
  crmSettings: { findUnique(args: { where: { id: string }; select: { followUpDelayDays: true } }): Promise<{ followUpDelayDays: number } | null> };
  lead: {
    findMany(args: { where: LeadWhere; select: Record<string, true> }): Promise<LifecycleLead[]>;
    updateMany(args: { where: LeadWhere; data: Partial<LifecycleLead> }): Promise<{ count: number }>;
    deleteMany(args: { where: { stage: string; discardedAt: { lte: Date } } }): Promise<{ count: number }>;
  };
  activity: {
    findFirst(args: { where: { leadId: string }; orderBy: { createdAt: 'desc' }; select: { actorId: true } }): Promise<{ actorId: string } | null>;
    create(args: { data: { leadId: string; actorId: string; type: string; note: string } }): Promise<unknown>;
  };
  followUp: {
    updateMany(args: { where: { leadId: string; state: 'PENDING' }; data: { state: 'CANCELLED'; cancelledAt: Date; cancelledById: string } }): Promise<{ count: number }>;
    create(args: { data: { leadId: string; dueDate: Date; ownerId: string; returnStage: string; note: string } }): Promise<unknown>;
  };
  stageHistory: { create(args: { data: { leadId: string; actorId: string; fromStage: string; toStage: string } }): Promise<unknown> };
}

export interface LifecycleDatabase extends LifecycleTransaction {
  $transaction<T>(callback: (tx: LifecycleTransaction) => Promise<T>): Promise<T>;
}

function assertValidNow(now: Date) {
  if (!Number.isFinite(now.valueOf())) throw new RangeError('A data atual do processamento deve ser válida.');
}

function snapshotWhere(lead: LifecycleLead): LeadWhere {
  return { id: lead.id, stage: lead.stage, stageEnteredAt: lead.stageEnteredAt, postFollowUpAt: lead.postFollowUpAt };
}

export async function processLeadLifecycle(database: LifecycleDatabase, now: Date): Promise<LifecycleProcessingResult> {
  assertValidNow(now);
  const delayDays = await getFollowUpDelayDays(database);
  const followUpCutoff = new Date(now.valueOf() - delayDays * 24 * 60 * 60 * 1000);
  const discardCutoff = new Date(now.valueOf() - 5 * 24 * 60 * 60 * 1000);
  const purgeCutoff = new Date(now.valueOf() - 7 * 24 * 60 * 60 * 1000);
  let movedToFollowUp = 0;
  let discardedForInactivity = 0;

  const discardCandidates = await database.lead.findMany({
    where: { stage: { in: postFollowUpExpiryStages }, postFollowUpAt: { lte: discardCutoff } },
    select: { id: true, stage: true, stageEnteredAt: true, postFollowUpAt: true, discardedAt: true }
  });
  for (const candidate of discardCandidates) {
    const discarded = await database.$transaction(async (tx) => {
      const changed = await tx.lead.updateMany({
        where: snapshotWhere(candidate),
        data: { stage: 'DISCARDED', stageEnteredAt: now, discardedAt: now, postFollowUpAt: null }
      });
      if (changed.count !== 1) return false;
      await tx.followUp.updateMany({
        where: { leadId: candidate.id, state: 'PENDING' },
        data: { state: 'CANCELLED', cancelledAt: now, cancelledById: teamOwnerId }
      });
      await tx.stageHistory.create({ data: { leadId: candidate.id, actorId: teamOwnerId, fromStage: candidate.stage, toStage: 'DISCARDED' } });
      await tx.activity.create({ data: { leadId: candidate.id, actorId: teamOwnerId, type: 'DISCARDED', note: 'Lead descartado automaticamente por inatividade.' } });
      return true;
    });
    if (discarded) discardedForInactivity += 1;
  }

  const dueCandidates = await database.lead.findMany({
    where: {
      stage: { in: activeStages },
      stageEnteredAt: { lte: followUpCutoff },
      postFollowUpAt: null
    },
    select: { id: true, stage: true, stageEnteredAt: true, postFollowUpAt: true, discardedAt: true }
  });
  for (const candidate of dueCandidates) {
    const moved = await database.$transaction(async (tx) => {
      const dueAt = getFollowUpDueAt(candidate.stageEnteredAt, delayDays);
      if (dueAt > now) return false;
      const changed = await tx.lead.updateMany({
        where: snapshotWhere(candidate),
        data: { stage: 'FOLLOW_UP', stageEnteredAt: now, postFollowUpAt: null, discardedAt: null }
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
      await tx.activity.create({ data: { leadId: candidate.id, actorId: teamOwnerId, type: 'FOLLOW_UP_SCHEDULED', note: systemNote } });
      return true;
    });
    if (moved) movedToFollowUp += 1;
  }

  const eligibleDiscarded = await database.lead.findMany({
    where: { stage: 'DISCARDED', discardedAt: { lte: purgeCutoff } },
    select: { id: true, stage: true, stageEnteredAt: true, postFollowUpAt: true, discardedAt: true }
  });
  const eligibleIds = eligibleDiscarded
    .filter((lead) => isPurgeEligible(lead.discardedAt, now))
    .map(({ id }) => id);
  const purge = eligibleIds.length
    ? await database.lead.deleteMany({ where: { stage: 'DISCARDED', discardedAt: { lte: purgeCutoff } } })
    : { count: 0 };

  return { movedToFollowUp, discardedForInactivity, permanentlyDeleted: purge.count };
}
