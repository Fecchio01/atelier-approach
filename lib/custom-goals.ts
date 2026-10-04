import type { GoalMetricActuals, GoalMetricKey } from './metrics';

export const customGoalIcons = ['target', 'prospecting', 'progress', 'car', 'users', 'currency', 'chart', 'checklist', 'star', 'handshake', 'calendar', 'wrench', 'trophy'] as const;

export const customGoalIconLabels: Record<typeof customGoalIcons[number], string> = {
  target: 'Alvo', prospecting: 'Prospecção', progress: 'Avanço', car: 'Carro', users: 'Pessoas',
  currency: 'Receita', chart: 'Gráfico', checklist: 'Checklist', star: 'Oportunidade',
  handshake: 'Acordo', calendar: 'Calendário', wrench: 'Serviço', trophy: 'Conquista'
};

export type CustomGoalSource = 'manual' | GoalMetricKey;
export type CustomGoalOrigin = 'manual' | 'pdf';
export const customGoalSourceLabels: Record<CustomGoalSource, string> = {
  manual: 'Manual', approaches: 'Abordagens', interests: 'Interesses', meetings: 'Reuniões',
  followUpsCompleted: 'Follow-ups concluídos', sales: 'Vendas', revenue: 'Receita', mrr: 'MRR', conversionRate: 'Conversão'
};

export type CustomGoalIcon = typeof customGoalIcons[number];

export const customGoalGroupKeys = ['prospecting', 'progress', 'revenue', 'vehicles', 'operations', 'other'] as const;
export type CustomGoalGroup = typeof customGoalGroupKeys[number];

export const customGoalGroups: Record<CustomGoalGroup, { label: string; description: string; icon: CustomGoalIcon }> = {
  prospecting: { label: 'Prospecção', description: 'Novas conversas e oportunidades para o time.', icon: 'prospecting' },
  progress: { label: 'Avanço', description: 'Relacionamentos que seguem pelo funil.', icon: 'progress' },
  revenue: { label: 'Receita', description: 'Resultados que se transformam em crescimento.', icon: 'currency' },
  vehicles: { label: 'Veículos', description: 'Entregas, carros e metas relacionadas à frota.', icon: 'car' },
  operations: { label: 'Operação', description: 'Serviços, reparos e entregas do time.', icon: 'wrench' },
  other: { label: 'Outros indicadores', description: 'Outras metas personalizadas da equipe.', icon: 'target' }
};

const customGoalGroupSet = new Set<string>(customGoalGroupKeys);

export type CustomGoalMetric = {
  id: string;
  name: string;
  unit?: string;
  target: number;
  current: number;
  icon?: CustomGoalIcon;
  group?: CustomGoalGroup;
  source?: CustomGoalSource;
  origin?: CustomGoalOrigin;
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

export function inferCustomGoalGroup(label: string, metricUnit?: string): CustomGoalGroup {
  const normalized = normalizeGoalText(`${label} ${metricUnit ?? ''}`);
  if (/r\$|\breais?\b|receita|faturamento|faturar|\bmrr\b|valor|recorrencia/.test(normalized)) return 'revenue';
  if (/carro|veiculo|automovel|moto|frota/.test(normalized)) return 'vehicles';
  if (/servic|reparo|manutenc|oficina|estetica/.test(normalized)) return 'operations';
  if (/reuniao|agenda|retorno|follow[ -]?ups?|visita|prazo|aprovad|confirmad|concluid|finaliz|entreg|dor(?:es)?|oportunidade|venda|acordo|contrato|negociacao/.test(normalized)) return 'progress';
  if (/prospeccao|abordagem|interesse|contato|lead|conversa|empresa|repeti|perfil|atendimento|cliente|pessoa|equipe/.test(normalized)) return 'prospecting';
  return 'other';
}

export function getCustomGoalGroup(goal: Pick<CustomGoalMetric, 'name' | 'unit' | 'group'>): CustomGoalGroup {
  return goal.group && customGoalGroupSet.has(goal.group) ? goal.group : inferCustomGoalGroup(goal.name, goal.unit);
}

/**
 * Keep legacy goals in their current visual section while their label is being
 * edited. The form can infer and persist a new section after the edit commits.
 */
export function updateCustomGoalDraft(
  goal: CustomGoalMetric,
  changes: Partial<CustomGoalMetric>
): CustomGoalMetric {
  const updatedGoal = { ...goal, ...changes };
  if (!goal.group && ('name' in changes || 'unit' in changes)) {
    updatedGoal.group = getCustomGoalGroup(goal);
  }
  return updatedGoal;
}

export function groupCustomGoals(goals: CustomGoalMetric[]): Record<CustomGoalGroup, CustomGoalMetric[]> {
  const grouped: Record<CustomGoalGroup, CustomGoalMetric[]> = {
    prospecting: [], progress: [], revenue: [], vehicles: [], operations: [], other: []
  };
  for (const goal of goals) grouped[getCustomGoalGroup(goal)].push(goal);
  return grouped;
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

    const { id, name, unit, target, current, icon, group, source, origin } = candidate;
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
    if (group !== undefined && (typeof group !== 'string' || !customGoalGroupSet.has(group))) {
      return { ok: false, message: 'Escolha um tema disponível para a meta personalizada.' };
    }
    if (source !== undefined && (typeof source !== 'string' || !Object.hasOwn(customGoalSourceLabels, source))) {
      return { ok: false, message: 'Escolha uma origem disponível para o progresso da meta.' };
    }
    if (origin !== undefined && origin !== 'manual' && origin !== 'pdf') {
      return { ok: false, message: 'Escolha uma origem disponível para o indicador.' };
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
      ...(group ? { group: group as CustomGoalGroup } : {}),
      ...(source ? { source: source as CustomGoalSource } : {}),
      ...(origin ? { origin: origin as CustomGoalOrigin } : {})
    });
  }

  return { ok: true, goals };
}
