import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, type GoalPeriodKind, type GoalPeriodWindow } from '@/lib/goal-periods';
import { getTeamGoalActualsByPeriod, type GoalMetricActuals, type GoalMetricKey } from '@/lib/metrics';

const OWNER_ID = '__team__';
const metricKeys: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'proposalsSent', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'];

function previousPeriods(current: GoalPeriodWindow, monthlyStartDay: number, count = 4) {
  const periods: GoalPeriodWindow[] = [];
  let cursor = current.start;
  for (let index = 0; index < count; index += 1) {
    const previous = getGoalPeriodWindow(current.kind, new Date(cursor.getTime() - 1), monthlyStartDay);
    periods.unshift(previous);
    cursor = previous.start;
  }
  return periods;
}

function suggestTargets(history: GoalMetricActuals[]) {
  const targets: Record<GoalMetricKey, number | null> = Object.fromEntries(metricKeys.map((key) => [key, null])) as Record<GoalMetricKey, number | null>;
  for (const key of metricKeys) {
    const usable = history.map((period) => period[key]).filter((value) => Number.isFinite(value) && value > 0);
    if (!usable.length) continue;
    const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
    if (key === 'revenue' || key === 'mrr') {
      targets[key] = Math.ceil((average * 1.1) / 100) * 100;
    } else if (key === 'conversionRate') {
      targets[key] = Math.min(100, Math.ceil(average * 1.05));
    } else {
      targets[key] = Math.max(1, Math.round(average * 1.1));
    }
  }
  return targets;
}

function isCompletelyEmpty(goal: {
  approachesTarget: number | null; interestsTarget: number | null; meetingsTarget: number | null;
  proposalsSentTarget: number | null; salesTarget: number | null; revenueTarget: number | null;
  mrrTarget: number | null; followUpsCompletedTarget: number | null; conversionRateTarget: number | null;
  customGoals: Prisma.JsonValue;
}) {
  return metricKeys.every((key) => goal[`${key}Target` as keyof typeof goal] == null)
    && Array.isArray(goal.customGoals) && goal.customGoals.length === 0;
}

function targetFields(targets: Record<GoalMetricKey, number | null>) {
  return {
    approachesTarget: targets.approaches,
    interestsTarget: targets.interests,
    meetingsTarget: targets.meetings,
    proposalsSentTarget: targets.proposalsSent,
    salesTarget: targets.sales,
    revenueTarget: targets.revenue,
    mrrTarget: targets.mrr,
    followUpsCompletedTarget: targets.followUpsCompleted,
    conversionRateTarget: targets.conversionRate
  };
}

async function planCycle(kind: GoalPeriodKind, current: GoalPeriodWindow, monthlyStartDay: number, now: Date) {
  const key = { ownerId: OWNER_ID, periodKind: kind, periodStart: current.start };
  const existing = await prisma.goal.findUnique({ where: { ownerId_periodKind_periodStart: key } });
  if (existing && !isCompletelyEmpty(existing)) return false;

  const historyPeriods = previousPeriods(current, monthlyStartDay);
  const actuals = await getTeamGoalActualsByPeriod(historyPeriods, now);
  const targets = suggestTargets(actuals);
  if (Object.values(targets).every((value) => value === null)) return false;

  if (existing) {
    // Fill only a blank cycle created by a reset/close action. Never replace a
    // target or custom indicator the team has already edited.
    const update = await prisma.goal.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: targetFields(targets)
    });
    return update.count === 1;
  }

  try {
    await prisma.goal.create({ data: { ...key, periodEnd: current.end, ...targetFields(targets), customGoals: [] } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
    throw error;
  }
}

export async function createDarwinGoalSuggestions(now = new Date()) {
  const settings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });
  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const activeGoals = await prisma.goal.findMany({
    where: {
      ownerId: OWNER_ID,
      periodStart: { lte: now },
      periodEnd: { gt: now },
      periodKind: { in: ['WEEKLY', 'MONTHLY'] }
    },
    select: { periodKind: true, periodStart: true, periodEnd: true }
  });
  const activeWindow = (kind: GoalPeriodKind): GoalPeriodWindow => {
    const active = activeGoals.find((goal) => goal.periodKind === kind);
    return active
      ? { kind, start: active.periodStart, end: active.periodEnd }
      : getGoalPeriodWindow(kind, now, monthlyStartDay);
  };
  const windows = [activeWindow('WEEKLY'), activeWindow('MONTHLY')];
  const [weekly, monthly] = await Promise.all([
    planCycle('WEEKLY', windows[0], monthlyStartDay, now),
    planCycle('MONTHLY', windows[1], monthlyStartDay, now)
  ]);
  return { weekly, monthly };
}
