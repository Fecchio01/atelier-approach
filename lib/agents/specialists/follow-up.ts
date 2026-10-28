import { CadenceStatus, Channel, CrmTaskPriority, CrmTaskState, CrmTaskType, MessagingDirection, MessagingStatus, ProposalVersionStatus, type Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { normalizeContact } from '@/lib/messaging/suppression';

export const cadencePolicy = { version: 'assisted-follow-up-v1', initialBusinessDays: 2, nextBusinessDays: 3, maxAttempts: 2, timezone: 'America/Sao_Paulo', localHour: 10 } as const;

function localCalendarDate(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: cadencePolicy.timezone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function getCadenceDueAt(referenceAt: Date, businessDays: number) {
  if (!Number.isFinite(referenceAt.valueOf()) || !Number.isInteger(businessDays) || businessDays < 1 || businessDays > 30) throw new RangeError('Intervalo de cadência inválido.');
  const local = localCalendarDate(referenceAt);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let remaining = businessDays;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  const targetLocalAsUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), cadencePolicy.localHour);
  const probe = new Date(targetLocalAsUtc);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: cadencePolicy.timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(probe);
  const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
  const observedLocalAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'));
  return new Date(targetLocalAsUtc - (observedLocalAsUtc - probe.valueOf()));
}

export function evaluateFollowUp(input: { stage: string; lastActivityAt: Date; lastMeaningfulInteractionAt: Date | null; hasNewReply: boolean; hasPendingAction: boolean; hasActiveProposal: boolean }) {
  if (input.stage === 'WON' || input.stage === 'DISCARDED') return { eligible: false, terminal: true, reason: 'Empresa encerrada ou descartada.' };
  if (input.hasNewReply) return { eligible: false, terminal: false, reason: 'Resposta recebida; equipe precisa revisar a conversa.' };
  if (input.hasActiveProposal || input.stage === 'PROPOSAL' || input.stage === 'MEETING') return { eligible: false, terminal: false, reason: 'Negociação ou reunião ativa; cadência pausada para revisão humana.' };
  if (input.lastMeaningfulInteractionAt && input.lastMeaningfulInteractionAt > input.lastActivityAt) return { eligible: false, terminal: false, reason: 'Interação mais recente que a cadência; reavalie a sequência.' };
  if (input.hasPendingAction) return { eligible: false, terminal: false, reason: 'Já existe uma ação humana pendente.' };
  return { eligible: true, terminal: false, reason: null };
}

export async function processFollowUpCadences(now = new Date(), database = prisma) {
  const controls = await database.agentAutomationSettings.findUnique({ where: { id: 'team' } });
  if (controls?.paused) return { paused: true, checked: 0, tasksCreated: 0, stopped: 0 };
  const due = await database.cadenceEnrollment.findMany({ where: { status: CadenceStatus.ACTIVE, nextDueAt: { lte: now } }, orderBy: { nextDueAt: 'asc' }, take: 100 });
  let tasksCreated = 0;
  let stopped = 0;
  for (const row of due) {
    const result = await database.$transaction(async (tx) => {
      const enrollment = await tx.cadenceEnrollment.findUnique({ where: { id: row.id }, include: { lead: { include: { messages: { where: { direction: MessagingDirection.INBOUND, createdAt: { gt: row.lastActivityAt } }, take: 1 }, proposals: { include: { versions: { where: { status: ProposalVersionStatus.APPROVED }, take: 1 } } } } } } });
      if (!enrollment || enrollment.status !== CadenceStatus.ACTIVE || enrollment.nextDueAt > now) return 'SKIP' as const;
      const pendingTask = await tx.crmTask.findFirst({ where: { leadId: enrollment.leadId, state: CrmTaskState.PENDING }, select: { id: true } });
      const pendingFollowUp = await tx.followUp.findFirst({ where: { leadId: enrollment.leadId, state: 'PENDING' }, select: { id: true } });
      const hasSuppression = await tx.contactSuppression.findFirst({ where: { channel: enrollment.lead.whatsapp ? Channel.WHATSAPP : Channel.PHONE, normalizedContact: normalizeContact(enrollment.lead.whatsapp ?? enrollment.lead.phone ?? '') }, select: { id: true } });
      const decision = evaluateFollowUp({
        stage: enrollment.lead.stage,
        lastActivityAt: enrollment.lastActivityAt,
        lastMeaningfulInteractionAt: enrollment.lead.lastMeaningfulInteractionAt,
        hasNewReply: enrollment.lead.messages.length > 0,
        hasPendingAction: Boolean(pendingTask || pendingFollowUp || hasSuppression),
        hasActiveProposal: enrollment.lead.proposals.some((proposal) => proposal.versions.length > 0)
      });
      if (!decision.eligible) {
        await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { status: decision.terminal ? CadenceStatus.CANCELLED : CadenceStatus.PAUSED, pauseReason: hasSuppression ? 'Contato suprimido; nenhuma ação foi gerada.' : decision.reason, activeTaskId: null } });
        return 'STOPPED' as const;
      }
      if (enrollment.attempt >= cadencePolicy.maxAttempts) {
        await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { status: CadenceStatus.COMPLETED, pauseReason: null } });
        return 'STOPPED' as const;
      }
      const reserved = await tx.cadenceEnrollment.updateMany({ where: { id: enrollment.id, status: CadenceStatus.ACTIVE, attempt: enrollment.attempt }, data: { status: CadenceStatus.WAITING_HUMAN } });
      if (reserved.count !== 1) return 'SKIP' as const;
      const attempt = enrollment.attempt + 1;
      const contactType = enrollment.lead.whatsapp ? CrmTaskType.WHATSAPP : enrollment.lead.phone ? CrmTaskType.PHONE : CrmTaskType.OTHER;
      const title = `Revisar follow-up #${attempt}: ${enrollment.lead.name ?? 'empresa'}`.slice(0, 160);
      const task = await tx.crmTask.create({ data: {
        leadId: enrollment.leadId, title, type: contactType,
      priority: CrmTaskPriority.NORMAL,
        dueDate: now, assigneeId: enrollment.ownerId, createdById: enrollment.ownerId, updatedById: enrollment.ownerId,
        effectKey: `cadence:${enrollment.id}:${attempt}`
      } });
      await tx.activity.create({ data: { leadId: enrollment.leadId, actorId: 'system:cadence', origin: 'SYSTEM', type: 'CRM_TASK_CREATED', note: `Ação de revisão de follow-up #${attempt} criada para a equipe.` } });
      await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { status: CadenceStatus.WAITING_HUMAN, attempt, activeTaskId: task.id, pauseReason: null } });
      return 'CREATED' as const;
    });
    if (result === 'CREATED') tasksCreated += 1;
    if (result === 'STOPPED') stopped += 1;
  }
  return { paused: false, checked: due.length, tasksCreated, stopped };
}
