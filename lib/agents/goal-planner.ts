import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, type GoalPeriodKind, type GoalPeriodWindow } from '@/lib/goal-periods';
import { getTeamGoalActualsByPeriod, type GoalMetricActuals, type GoalMetricKey } from '@/lib/metrics';

const OWNER_ID = '__team__';
const metricKeys: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'proposalsSent', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'];
const saoPauloDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

function countProspectingDays(start: Date, end: Date): number {
  const dateParts = (date: Date) => {
    const parts = saoPauloDate.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value('year'), month: value('month'), day: value('day') };
  };
  const first = dateParts(start);
  const last = dateParts(new Date(end.getTime() - 1));
  const cursor = new Date(Date.UTC(first.year, first.month - 1, first.day));
  const lastDay = Date.UTC(last.year, last.month - 1, last.day);
  let weekdays = 0;
  while (cursor.getTime() <= lastDay) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return weekdays;
}

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

function countMissingSuggestedTargets(goal: {
  approachesTarget: number | null; interestsTarget: number | null; meetingsTarget: number | null;
  proposalsSentTarget: number | null; salesTarget: number | null; revenueTarget: number | null;
  mrrTarget: number | null; followUpsCompletedTarget: number | null; conversionRateTarget: number | null;
}, targets: Record<GoalMetricKey, number | null>) {
  return metricKeys.filter((key) => goal[`${key}Target` as keyof typeof goal] == null && targets[key] !== null).length;
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

export type GoalSuggestionStatus = 'created' | 'updated' | 'unchanged' | 'no_history' | 'concurrent_change';

export type GoalSuggestionResult = {
  kind: GoalPeriodKind;
  status: GoalSuggestionStatus;
  metricsSaved: number;
};

async function planCycle(kind: GoalPeriodKind, current: GoalPeriodWindow, monthlyStartDay: number, now: Date, replaceApproaches: boolean): Promise<GoalSuggestionResult> {
  const key = { ownerId: OWNER_ID, periodKind: kind, periodStart: current.start };
  const existing = await prisma.goal.findUnique({ where: { ownerId_periodKind_periodStart: key } });

  const historyPeriods = previousPeriods(current, monthlyStartDay);
  const actuals = await getTeamGoalActualsByPeriod(historyPeriods, now);
  const targets = suggestTargets(actuals);
  const automation = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' }, select: { prospectingDailyLimit: true } });
  const dailyLimit = automation?.prospectingDailyLimit ?? 10;
  const approachesTarget = dailyLimit * countProspectingDays(current.start, current.end);
  targets.approaches = approachesTarget;
  const metricsToSave = existing
    ? countMissingSuggestedTargets(existing, targets) + (replaceApproaches && existing.approachesTarget != null && existing.approachesTarget !== approachesTarget ? 1 : 0)
    : metricKeys.filter((metric) => targets[metric] !== null).length;
  if (metricsToSave === 0) {
    return {
      kind,
      status: existing && metricKeys.some((metric) => existing[`${metric}Target` as keyof typeof existing] !== null)
        ? 'unchanged'
        : 'no_history',
      metricsSaved: 0
    };
  }

  if (existing) {
    // Fill blank built-in metrics; on an explicit chat request, recalculate
    // approaches from the configured daily prospecting limit. Keep custom goals.
    const proposedFields = targetFields(targets);
    const data = Object.fromEntries(metricKeys.flatMap((metric) => {
      if (metric === 'approaches' && replaceApproaches) {
        if (existing.approachesTarget === approachesTarget) return [];
        return [['approachesTarget', approachesTarget]];
      }
      if (existing[`${metric}Target` as keyof typeof existing] !== null || targets[metric] === null) return [];
      const field = `${metric}Target`;
      return [[field, proposedFields[field as keyof typeof proposedFields]]];
    })) as Partial<ReturnType<typeof targetFields>>;
    const update = await prisma.goal.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data
    });
    if (update.count === 1) revalidateGoals();
    return { kind, status: update.count === 1 ? 'updated' : 'concurrent_change', metricsSaved: update.count === 1 ? metricsToSave : 0 };
  }

  try {
    await prisma.goal.create({ data: { ...key, periodEnd: current.end, ...targetFields(targets), customGoals: [] } });
    revalidateGoals();
    return { kind, status: 'created', metricsSaved: metricsToSave };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind, status: 'concurrent_change', metricsSaved: 0 };
    }
    throw error;
  }
}

export async function createDarwinGoalSuggestion(kind: GoalPeriodKind, now = new Date(), replaceApproaches = false): Promise<GoalSuggestionResult> {
  const settings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });
  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const activeGoals = await prisma.goal.findMany({
    where: {
      ownerId: OWNER_ID,
      periodStart: { lte: now },
      periodEnd: { gt: now },
      periodKind: kind
    },
    select: { periodStart: true, periodEnd: true }
  });
  const active = activeGoals[0];
  const current = active
    ? { kind, start: active.periodStart, end: active.periodEnd }
    : getGoalPeriodWindow(kind, now, monthlyStartDay);
  return planCycle(kind, current, monthlyStartDay, now, replaceApproaches);
}

async function revalidateGoals() {
  revalidatePath('/');
  revalidatePath('/metas');
  revalidatePath('/relatorios');
}

export async function createDarwinGoalSuggestions(now = new Date()) {
  const [weekly, monthly] = await Promise.all([
    createDarwinGoalSuggestion('WEEKLY', now),
    createDarwinGoalSuggestion('MONTHLY', now)
  ]);
  return { weekly: weekly.status === 'created' || weekly.status === 'updated', monthly: monthly.status === 'created' || monthly.status === 'updated' };
}
