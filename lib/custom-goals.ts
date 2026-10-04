import type { GoalMetricActuals, GoalMetricKey } from './metrics';

export const customGoalIcons = ['target', 'prospecting', 'progress', 'car', 'users', 'currency', 'chart', 'checklist', 'star', 'handshake', 'calendar', 'wrench', 'trophy'] as const;

export const customGoalIconLabels: Record<typeof customGoalIcons[number], string> = {
  target: 'Alvo', prospecting: 'Prospecção', progress: 'Avanço', car: 'Carro', users: 'Pessoas',
  currency: 'Receita', chart: 'Gráfico', checklist: 'Checklist', star: 'Oportunidade',
  handshake: 'Acordo', calendar: 'Calendário', wrench: 'Serviço', trophy: 'Conquista'
};

export type CustomGoalSource = 'manual' | GoalMetricKey;
export const customGoalSourceLabels: Record<CustomGoalSource, string> = {
  manual: 'Manual', approaches: 'Abordagens', interests: 'Interesses', meetings: 'Reuniões',
  followUpsCompleted: 'Follow-ups concluídos', sales: 'Vendas', revenue: 'Receita', mrr: 'MRR', conversionRate: 'Conversão'
};

export type CustomGoalIcon = typeof customGoalIcons[number];

export type CustomGoalMetric = {
  id: string;
  name: string;
  unit?: string;
  target: number;
  current: number;
  icon?: CustomGoalIcon;
  source?: CustomGoalSource;
};

function normalizeGoalText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function inferCustomGoalIcon(label: string, metricUnit?: string): CustomGoalIcon {
  const normalized = normalizeGoalText(`${label} ${metricUnit ?? ''}`);
  if (/r\$|\breais?\b|receita|faturamento|faturar|\bmrr\b|valor/.test(normalized)) return 'currency';
  if (/carro|veiculo|automovel|moto/.test(normalized)) return 'car';
  if (/reuniao|agenda|retorno|follow[ -]?ups?|visita|prazo/.test(normalized)) return 'calendar';
  if (/aprovad|confirmad|concluid|finaliz|entreg/.test(normalized)) return 'checklist';
  if (/oportunidade|destaque/.test(normalized)) return 'star';
  if (/venda|acordo|contrato|parceria|negociacao/.test(normalized)) return 'handshake';
  if (/servico|reparo|manutencao|oficina|estetica/.test(normalized)) return 'wrench';
  if (/repeti|perfil|taxa|conversao|desempenho|crescimento/.test(normalized)) return 'chart';
  if (/premio|conquista|objetivo/.test(normalized)) return 'trophy';
  if (/prospeccao|abordagem|contato|lead/.test(normalized)) return 'prospecting';
  if (/avanco|pipeline|etapa/.test(normalized)) return 'progress';
  if (/equipe|cliente|pessoa|atendimento|conversa|empresa/.test(normalized)) return 'users';
  return 'target';
}

export function getCustomGoalIcon(goal: Pick<CustomGoalMetric, 'name' | 'unit' | 'icon'>): CustomGoalIcon {
  if (goal.icon && goal.icon !== 'target' && customGoalIcons.includes(goal.icon)) return goal.icon;
  return inferCustomGoalIcon(goal.name, goal.unit);
}

export function getCustomGoalCurrent(goal: CustomGoalMetric, actuals: GoalMetricActuals): number {
  return !goal.source || goal.source === 'manual' ? goal.current : actuals[goal.source];
}

export type CustomGoalParseResult =
  | { ok: true; goals: CustomGoalMetric[] }
  | { ok: false; message: string };

const maxCustomGoals = 30;
const maxNameLength = 80;
const maxUnitLength = 24;
const validId = /^[a-zA-Z0-9_-]{1,64}$/;
const iconSet = new Set<string>(customGoalIcons);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCustomGoalMetrics(input: unknown): CustomGoalParseResult {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, message: 'As metas personalizadas estão em um formato inválido.' };
    }
  }

  if (!Array.isArray(value) || value.length > maxCustomGoals) {
    return { ok: false, message: `Adicione no máximo ${maxCustomGoals} metas personalizadas por ciclo.` };
  }

  const seenIds = new Set<string>();
  const goals: CustomGoalMetric[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) return { ok: false, message: 'Revise os dados das metas personalizadas.' };

    const { id, name, unit, target, current, icon, source } = candidate;
    if (typeof id !== 'string' || !validId.test(id) || seenIds.has(id)) {
      return { ok: false, message: 'Cada meta personalizada precisa de um identificador único válido.' };
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > maxNameLength) {
      return { ok: false, message: `O nome de cada meta deve ter entre 1 e ${maxNameLength} caracteres.` };
    }
    if (unit !== undefined && unit !== null && (typeof unit !== 'string' || unit.trim().length > maxUnitLength)) {
      return { ok: false, message: `A unidade deve ter até ${maxUnitLength} caracteres.` };
    }
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0
      || typeof current !== 'number' || !Number.isFinite(current) || current < 0) {
      return { ok: false, message: 'A meta e o progresso não podem ser negativos.' };
    }
    if (icon !== undefined && (typeof icon !== 'string' || !iconSet.has(icon))) {
      return { ok: false, message: 'Escolha um dos ícones disponíveis para a meta.' };
    }
    if (source !== undefined && (typeof source !== 'string' || !Object.hasOwn(customGoalSourceLabels, source))) {
      return { ok: false, message: 'Escolha uma origem disponível para o progresso da meta.' };
    }

    seenIds.add(id);
    const trimmedUnit = typeof unit === 'string' ? unit.trim() : '';
    goals.push({
      id,
      name: name.trim(),
      ...(trimmedUnit ? { unit: trimmedUnit } : {}),
      target,
      current,
      ...(icon ? { icon: icon as CustomGoalIcon } : {}),
      ...(source ? { source: source as CustomGoalSource } : {})
    });
  }

  return { ok: true, goals };
}
