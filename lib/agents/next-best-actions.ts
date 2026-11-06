import { normalizeFunnelStage, stageLabels } from '@/lib/funnel';

const dayMs = 86_400_000;
export const NEXT_ACTION_LIMIT = 5;

export type NextActionLead = {
  id: string;
  name: string | null;
  stage: string;
  stageEnteredAt: Date;
  lastMeaningfulInteractionAt: Date | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  discardedAt?: Date | null;
};

export type NextBestAction = {
  leadId: string;
  leadName: string;
  stage: string;
  kind: 'PROPOSAL_RETURN' | 'CONVERSATION_RETURN' | 'QUALIFIED_NEXT_STEP' | 'FOLLOW_UP_RESTART';
  title: string;
  reason: string;
  suggestedTaskType: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'OTHER';
  suggestedPriority: 'HIGH' | 'NORMAL';
  rank: number;
};

export function getSaoPauloDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function saoPauloDayBounds(dateKey: string) {
  const localMidnight = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    const target = Date.UTC(year, month - 1, day);
    let utcValue = target;
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    // Correct the UTC guess against the wall-clock representation in São Paulo.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = formatter.formatToParts(new Date(utcValue));
      const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
      const represented = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
      utcValue += target - represented;
    }
    return new Date(utcValue);
  };
  const [year, month, day] = dateKey.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDate.getUTCDate()).padStart(2, '0')}`;
  return { start: localMidnight(dateKey), end: localMidnight(nextKey) };
}

function wholeCalendarDaysBetween(earlier: Date, later: Date) {
  const a = getSaoPauloDateKey(earlier).split('-').map(Number);
  const b = getSaoPauloDateKey(later).split('-').map(Number);
  return Math.floor((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / dayMs);
}

function availableTaskType(lead: NextActionLead): NextBestAction['suggestedTaskType'] {
  if (lead.whatsapp) return 'WHATSAPP';
  if (lead.phone) return 'PHONE';
  if (lead.website || lead.instagram) return 'EMAIL';
  return 'OTHER';
}

export function buildNextBestActions(
  leads: readonly NextActionLead[],
  leadsWithOpenWork: ReadonlySet<string>,
  now = new Date(),
  limit = NEXT_ACTION_LIMIT
): NextBestAction[] {
  const candidates: NextBestAction[] = [];
  for (const lead of leads) {
    if (leadsWithOpenWork.has(lead.id) || lead.discardedAt) continue;
    const stage = normalizeFunnelStage(lead.stage);
    if (stage === 'WON' || stage === 'DISCARDED' || !Number.isFinite(lead.stageEnteredAt.valueOf())) continue;
    const idleDays = Math.max(0, wholeCalendarDaysBetween(lead.stageEnteredAt, now));
    let candidate: Omit<NextBestAction, 'leadId' | 'leadName' | 'stage' | 'suggestedTaskType'> | null = null;

    if (stage === 'PROPOSAL' && idleDays >= 5) {
      candidate = { kind: 'PROPOSAL_RETURN', title: 'Retomar proposta', reason: `A proposta está nesta etapa há ${idleDays} dias. Confirme se foi recebida e combine um próximo passo.`, suggestedPriority: 'HIGH', rank: 0 };
    } else if (stage === 'IN_CONVERSATION' && idleDays >= 3) {
      candidate = { kind: 'CONVERSATION_RETURN', title: 'Retomar conversa', reason: `A conversa está sem avanço há ${idleDays} dias. Retome o contato e registre a resposta.`, suggestedPriority: 'NORMAL', rank: 1 };
    } else if (stage === 'QUALIFIED' && idleDays >= 3) {
      candidate = { kind: 'QUALIFIED_NEXT_STEP', title: 'Definir próximo passo', reason: `A oportunidade está qualificada há ${idleDays} dias. Envie uma proposta ou combine uma reunião.`, suggestedPriority: 'NORMAL', rank: 2 };
    } else if (stage === 'FOLLOW_UP' && idleDays >= 3) {
      candidate = { kind: 'FOLLOW_UP_RESTART', title: 'Revisar follow-up', reason: `A oportunidade está em Follow-up há ${idleDays} dias e não tem retorno pendente. Verifique o que fazer a seguir.`, suggestedPriority: 'NORMAL', rank: 3 };
    }

    if (candidate) candidates.push({
      ...candidate,
      leadId: lead.id,
      leadName: lead.name?.trim() || 'Empresa sem nome',
      stage: stageLabels[stage],
      suggestedTaskType: availableTaskType(lead)
    });
  }

  return candidates.sort((a, b) => a.rank - b.rank || a.leadName.localeCompare(b.leadName, 'pt-BR') || a.leadId.localeCompare(b.leadId)).slice(0, Math.max(0, limit));
}

