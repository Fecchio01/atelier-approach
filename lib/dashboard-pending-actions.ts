import { normalizeFunnelStage, stageLabels } from './funnel';

const dayMs = 24 * 60 * 60 * 1000;
const staleStageDays = 3;
const meetingReminderWindowMs = dayMs;

export type DashboardActionLead = {
  id: string;
  name: string | null;
  stage: string;
  stageEnteredAt: Date;
  meetingAt: Date | null;
  postFollowUpAt: Date | null;
};

export type DashboardPendingAction = {
  leadId: string;
  leadName: string;
  stage: string;
  kind: 'STALE_CONVERSATION' | 'STALE_QUALIFIED' | 'MEETING_UNSCHEDULED' | 'MEETING_SOON' | 'MEETING_OVERDUE';
  title: string;
  detail: string;
  actionAt: Date | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
});

function daysSince(date: Date, now: Date) {
  return Math.floor((now.valueOf() - date.valueOf()) / dayMs);
}

export function getDashboardPendingActions(leads: DashboardActionLead[], now: Date): DashboardPendingAction[] {
  if (!Number.isFinite(now.valueOf())) throw new RangeError('A data atual deve ser válida.');
  const actions: DashboardPendingAction[] = [];

  for (const lead of leads) {
    if (lead.postFollowUpAt) continue;
    const stage = normalizeFunnelStage(lead.stage);
    const leadName = lead.name?.trim() || 'Lead sem nome';

    if (stage === 'IN_CONVERSATION' || stage === 'QUALIFIED') {
      if (!Number.isFinite(lead.stageEnteredAt.valueOf())) continue;
      const idleDays = daysSince(lead.stageEnteredAt, now);
      if (idleDays < staleStageDays) continue;
      const isConversation = stage === 'IN_CONVERSATION';
      const kind = isConversation ? 'STALE_CONVERSATION' : 'STALE_QUALIFIED';
      actions.push({
        leadId: lead.id,
        leadName,
        stage: stageLabels[stage],
        kind,
        title: isConversation ? 'Retomar conversa' : 'Definir próximo passo',
        detail: `Sem avanço há ${idleDays} dias. ${isConversation ? 'Retome o contato ou registre o próximo passo.' : 'Envie uma proposta ou agende uma reunião.'}`,
        actionAt: new Date(lead.stageEnteredAt.valueOf() + staleStageDays * dayMs)
      });
      continue;
    }

    if (stage !== 'MEETING') continue;
    if (!lead.meetingAt) {
      actions.push({
        leadId: lead.id, leadName, stage: stageLabels[stage], kind: 'MEETING_UNSCHEDULED',
        title: 'Agendar reunião', detail: 'Este lead está na etapa Reunião sem data e hora registradas.', actionAt: null
      });
      continue;
    }
    if (!Number.isFinite(lead.meetingAt.valueOf())) continue;
    const meetingAtMs = lead.meetingAt.valueOf();
    if (meetingAtMs <= now.valueOf()) {
      actions.push({
        leadId: lead.id, leadName, stage: stageLabels[stage], kind: 'MEETING_OVERDUE',
        title: 'Registrar resultado da reunião', detail: `Reunião prevista para ${dateTimeFormatter.format(lead.meetingAt)}. Avance a etapa ou reagende.`, actionAt: lead.meetingAt
      });
    } else if (meetingAtMs <= now.valueOf() + meetingReminderWindowMs) {
      actions.push({
        leadId: lead.id, leadName, stage: stageLabels[stage], kind: 'MEETING_SOON',
        title: 'Reunião nas próximas 24 horas', detail: `Encontro marcado para ${dateTimeFormatter.format(lead.meetingAt)}.`, actionAt: lead.meetingAt
      });
    }
  }

  const priority: Record<DashboardPendingAction['kind'], number> = {
    MEETING_OVERDUE: 0, MEETING_UNSCHEDULED: 1, STALE_CONVERSATION: 2, STALE_QUALIFIED: 3, MEETING_SOON: 4
  };
  return actions.sort((first, second) => priority[first.kind] - priority[second.kind] || first.leadName.localeCompare(second.leadName));
}
