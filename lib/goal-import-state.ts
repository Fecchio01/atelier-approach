import { customGoalIcons, type CustomGoalIcon, type CustomGoalMetric } from './custom-goals';
import type { GoalMetricKey } from './metrics';

export type ReviewedGoalSuggestion = {
  id: string;
  name: string;
  unit?: string;
  target: string;
  current: string;
  destination: GoalMetricKey | 'custom';
  icon: CustomGoalIcon;
};

export function applyGoalSuggestions(
  currentTargets: Partial<Record<GoalMetricKey, string>>,
  currentCustomGoals: CustomGoalMetric[],
  suggestions: ReviewedGoalSuggestion[]
) {
  const targets = { ...currentTargets };
  const customGoals = [...currentCustomGoals];
  const usedIds = new Set(customGoals.map(({ id }) => id));

  for (const suggestion of suggestions) {
    const target = Number(suggestion.target.replace(',', '.'));
    const current = Number(suggestion.current.replace(',', '.'));
    if (!suggestion.name.trim() || !Number.isFinite(target) || target <= 0
      || !Number.isFinite(current) || current < 0) continue;

    if (suggestion.destination !== 'custom') {
      targets[suggestion.destination] = String(target);
      continue;
    }

    if (usedIds.has(suggestion.id) || !customGoalIcons.includes(suggestion.icon)) continue;
    const unit = suggestion.unit?.trim();
    customGoals.push({
      id: suggestion.id,
      name: suggestion.name.trim(),
      ...(unit ? { unit } : {}),
      target,
      current,
      icon: suggestion.icon
    });
    usedIds.add(suggestion.id);
  }

  return { targets, customGoals };
}
