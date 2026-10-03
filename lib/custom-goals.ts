export const customGoalIcons = ['target', 'car', 'users', 'currency', 'chart', 'checklist', 'star', 'handshake', 'calendar', 'wrench', 'trophy'] as const;

export type CustomGoalIcon = typeof customGoalIcons[number];

export type CustomGoalMetric = {
  id: string;
  name: string;
  unit?: string;
  target: number;
  current: number;
  icon?: CustomGoalIcon;
};

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

    const { id, name, unit, target, current, icon } = candidate;
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

    seenIds.add(id);
    const trimmedUnit = typeof unit === 'string' ? unit.trim() : '';
    goals.push({
      id,
      name: name.trim(),
      ...(trimmedUnit ? { unit: trimmedUnit } : {}),
      target,
      current,
      ...(icon ? { icon: icon as CustomGoalIcon } : {})
    });
  }

  return { ok: true, goals };
}
