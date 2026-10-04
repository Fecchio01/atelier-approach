import { customGoalIcons, customGoalGroupKeys, type CustomGoalGroup, type CustomGoalIcon, type CustomGoalMetric } from './custom-goals';
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

export function removePdfImportedCustomGoals(customGoals: CustomGoalMetric[]) {
  return customGoals.filter((goal) => goal.origin !== 'pdf');
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
  const customGoals = removePdfImportedCustomGoals(currentCustomGoals);

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
    const existingIndex = customGoals.findIndex((goal) => goal.id === suggestion.id);
    if (existingIndex === -1) customGoals.push(customGoal);
    else customGoals[existingIndex] = customGoal;
  }

  return { targets, customGoals };
}
