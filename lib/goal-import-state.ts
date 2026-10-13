import { areEquivalentCustomGoals, customGoalIcons, customGoalGroupKeys, getCustomGoalGroup, type CustomGoalGroup, type CustomGoalIcon, type CustomGoalMetric } from './custom-goals';
import type { GoalMetricKey } from './metrics';

export type ReviewedGoalSuggestion = {
  id: string;
  name: string;
  unit?: string;
  target: string;
  current: string;
  destination: GoalMetricKey | 'custom';
  icon: CustomGoalIcon;
  group?: CustomGoalGroup;
};

export function shouldReviewGoalSuggestions(suggestions: ReviewedGoalSuggestion[]) {
  return suggestions.some((suggestion) => suggestion.destination === 'custom');
}

export function removePdfImportedCustomGoals(customGoals: CustomGoalMetric[]) {
  return customGoals.filter((goal) => goal.origin !== 'pdf');
}

const redundantGoalAliases = new Set([
  'propostas enviadas', 'proposta enviada', 'propostas comerciais enviadas', 'proposta comercial enviada',
  'vendas fechadas', 'conversoes em vendas', 'conversao em vendas', 'vendas confirmadas', 'venda confirmada',
  'negocios fechados', 'negocio fechado'
]);
const uselessGoalPrefixes = [
  'respostas recebidas', 'cadastros completos', 'execucao de novas abordagens'
];

function normalizeImportedGoalName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\s*\((?:personalizado|quantidade)\)\s*$/i, '')
    .replace(/\s*[—–-]\s*.*$/, '')
    .replace(/\s+/g, ' ').trim();
}

/** Removes legacy PDF rows that duplicate native metrics or were explicitly rejected as useless. */
export function removeRedundantCustomGoals(customGoals: CustomGoalMetric[]) {
  const relevantGoals = customGoals.filter((goal) => {
    const name = normalizeImportedGoalName(goal.name);
    return !redundantGoalAliases.has(name)
      && !uselessGoalPrefixes.some((prefix) => name === prefix || name.startsWith(`${prefix} `) || name.startsWith(`${prefix}(`));
  });

  const result: CustomGoalMetric[] = [];
  const conflictingPdfGoals: CustomGoalMetric[] = [];
  for (const goal of relevantGoals) {
    if (goal.origin !== 'pdf') {
      result.push(goal);
      for (let index = result.length - 2; index >= 0; index -= 1) {
        if (result[index].origin === 'pdf' && areEquivalentCustomGoals(result[index], goal)) result.splice(index, 1);
      }
      continue;
    }
    if (conflictingPdfGoals.some((conflict) => areEquivalentCustomGoals(conflict, goal))) continue;
    if (result.some((saved) => saved.origin !== 'pdf' && areEquivalentCustomGoals(saved, goal))) continue;

    const duplicateIndex = result.findIndex((saved) => saved.origin === 'pdf' && areEquivalentCustomGoals(saved, goal));
    if (duplicateIndex === -1) {
      result.push(goal);
    } else if (result[duplicateIndex].target === goal.target) {
      // Equivalent PDF rows with the same quota are represented once.
      continue;
    } else {
      // Conflicting PDF copies are removed rather than choosing a quota at random.
      conflictingPdfGoals.push(result[duplicateIndex], goal);
      result.splice(duplicateIndex, 1);
    }
  }
  return result;
}

export function removeCustomGoalsByGroup(customGoals: CustomGoalMetric[], group: CustomGoalGroup) {
  return customGoals.filter((goal) => getCustomGoalGroup(goal) !== group);
}

export function createGoalSaveFormData(
  targets: Partial<Record<GoalMetricKey, string>>,
  customGoals: CustomGoalMetric[],
  monthlyStartDay?: string
): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(targets)) {
    if (value !== undefined) formData.set(key, value);
  }
  formData.set('customGoals', JSON.stringify(customGoals));
  if (monthlyStartDay !== undefined) formData.set('monthlyStartDay', monthlyStartDay);
  return formData;
}

export function applyGoalSuggestions(
  currentTargets: Partial<Record<GoalMetricKey, string>>,
  currentCustomGoals: CustomGoalMetric[],
  suggestions: ReviewedGoalSuggestion[]
) {
  const targets = { ...currentTargets };
  const customGoals = removeRedundantCustomGoals(removePdfImportedCustomGoals(currentCustomGoals));

  for (const suggestion of suggestions) {
    const target = Number(suggestion.target.replace(',', '.'));
    const current = Number(suggestion.current.replace(',', '.'));
    if (!suggestion.name.trim() || !Number.isFinite(target) || target < 0
      || !Number.isFinite(current) || current < 0) continue;

    if (suggestion.destination !== 'custom') {
      if (target === 0) continue;
      targets[suggestion.destination] = String(target);
      continue;
    }

    if (!customGoalIcons.includes(suggestion.icon)
      || suggestion.group !== undefined && !customGoalGroupKeys.includes(suggestion.group)) continue;
    const unit = suggestion.unit?.trim();
    const customGoal = {
      id: suggestion.id,
      name: suggestion.name.trim(),
      ...(unit ? { unit } : {}),
      target,
      current,
      icon: suggestion.icon,
      ...(suggestion.group ? { group: suggestion.group } : {}),
      source: 'manual',
      origin: 'pdf'
    } satisfies CustomGoalMetric;
    const existingIndex = customGoals.findIndex((goal) => goal.id === suggestion.id || areEquivalentCustomGoals(goal, customGoal));
    if (existingIndex === -1) customGoals.push(customGoal);
    else {
      const existingGoal = customGoals[existingIndex];
      customGoals[existingIndex] = {
        ...existingGoal,
        ...(existingGoal.unit || !customGoal.unit ? {} : { unit: customGoal.unit }),
        target: customGoal.target,
        current: customGoal.current
      };
    }
  }

  return { targets, customGoals: removeRedundantCustomGoals(customGoals) };
}
