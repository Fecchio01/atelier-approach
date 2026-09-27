import type { GoalMetricKey, TeamGoalTargets } from './metrics';

export type GoalTargetFormValues = Partial<Record<GoalMetricKey, string | null | undefined>>;
export type GoalTargetParseResult = { ok: true; targets: TeamGoalTargets } | { ok: false; message: string };

const countTargets: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'sales', 'followUpsCompleted'];
const moneyTargets: GoalMetricKey[] = ['revenue', 'mrr'];
const allTargets: GoalMetricKey[] = [...countTargets, ...moneyTargets, 'conversionRate'];

export function parseGoalTargets(values: GoalTargetFormValues): GoalTargetParseResult {
  const targets = Object.fromEntries(allTargets.map((key) => {
    const raw = values[key]?.trim() ?? '';
    if (!raw) return [key, null];

    const value = Number(raw);
    if (!Number.isFinite(value)) return [key, Number.NaN];
    if (countTargets.includes(key) && (!Number.isInteger(value) || value <= 0)) return [key, Number.NaN];
    if (moneyTargets.includes(key) && value <= 0) return [key, Number.NaN];
    if (key === 'conversionRate' && (value < 1 || value > 100)) return [key, Number.NaN];
    return [key, value];
  })) as TeamGoalTargets;

  if (allTargets.some((key) => Number.isNaN(targets[key]))) {
    return { ok: false, message: 'Use quantidades inteiras positivas, valores financeiros positivos e conversão entre 1% e 100%.' };
  }

  return { ok: true, targets };
}
