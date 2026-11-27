import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, getLocalDayWindow, type GoalPeriodKind, type GoalPeriodWindow } from '@/lib/goal-periods';
import { getTeamGoalActualsByPeriod, type GoalMetricActuals, type GoalMetricKey } from '@/lib/metrics';

const OWNER_ID = '__team__';
const metricKeys: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'proposalsSent', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'];
const estimatedFunnelRates: Partial<Record<GoalMetricKey, number>> = {
  interests: 0.2,
  meetings: 0.1,
  proposalsSent: 0.05,
  sales: 0.02,
  followUpsCompleted: 0.2
};
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

function fillTargetsFromCurrentPace(
  targets: Record<GoalMetricKey, number | null>,
  actuals: GoalMetricActuals,
  period: GoalPeriodWindow,
  now: Date,
  existing?: ExistingGoalTargets
): GoalMetricKey[] {
  const totalProspectingDays = countProspectingDays(period.start, period.end);
  if (totalProspectingDays === 0) return [];
  const todayEnd = getLocalDayWindow(now).end;
  const elapsedEnd = new Date(Math.min(period.end.getTime(), Math.max(period.start.getTime(), todayEnd.getTime())));
  const elapsedProspectingDays = Math.max(1, countProspectingDays(period.start, elapsedEnd));
  const projectedMetrics: GoalMetricKey[] = [];
  for (const key of metricKeys) {
    if (targets[key] !== null || existing?.[`${key}Target`] != null || actuals[key] <= 0) continue;
    if (key === 'conversionRate') {
      targets[key] = Math.min(100, Math.ceil(actuals[key] * 1.05));
      projectedMetrics.push(key);
      continue;
    }
    const projected = actuals[key] * totalProspectingDays / elapsedProspectingDays;
    if (key === 'revenue' || key === 'mrr') {
      targets[key] = Math.ceil((projected * 1.1) / 100) * 100;
    } else {
      targets[key] = Math.max(1, Math.ceil(projected * 1.1));
    }
    projectedMetrics.push(key);
  }
  return projectedMetrics;
}

async function previousGoalPeriods(current: GoalPeriodWindow, monthlyStartDay: number): Promise<GoalPeriodWindow[]> {
  const savedCycles = await prisma.goal.findMany({
    where: { ownerId: OWNER_ID, periodKind: current.kind, periodStart: { lt: current.start } },
    orderBy: { periodStart: 'desc' },
    take: 4,
    select: { periodStart: true, periodEnd: true }
  });
  if (savedCycles.length) {
    return savedCycles.reverse().map(({ periodStart, periodEnd }) => ({
      kind: current.kind,
      start: periodStart,
      end: periodEnd
    }));
  }
  return previousPeriods(current, monthlyStartDay);
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

function estimateMissingTargets(targets: Record<GoalMetricKey, number | null>, approachesTarget: number) {
  const estimatedMetrics: GoalMetricKey[] = [];
  for (const [metric, rate] of Object.entries(estimatedFunnelRates) as Array<[GoalMetricKey, number]>) {
    if (targets[metric] !== null) continue;
    targets[metric] = Math.max(1, Math.ceil(approachesTarget * rate));
    estimatedMetrics.push(metric);
  }
  if (targets.conversionRate === null) {
    targets.conversionRate = 2;
    estimatedMetrics.push('conversionRate');
  }
  return estimatedMetrics;
}

function estimateFinancialTargets(
  targets: Record<GoalMetricKey, number | null>,
  services: Array<{ price: number; billingType: 'ONE_TIME' | 'MONTHLY' }>
) {
  const estimatedMetrics: GoalMetricKey[] = [];
  const sales = targets.sales ?? 0;
  if (sales <= 0 || !services.length) return estimatedMetrics;

  if (targets.revenue === null) {
    const averageServicePrice = services.reduce((sum, service) => sum + service.price, 0) / services.length;
    if (averageServicePrice > 0) {
      targets.revenue = Math.ceil(sales * averageServicePrice / 10) * 10;
      estimatedMetrics.push('revenue');
    }
  }

  const monthlyServices = services.filter((service) => service.billingType === 'MONTHLY');
  if (targets.mrr === null && monthlyServices.length) {
    const averageMonthlyPrice = monthlyServices.reduce((sum, service) => sum + service.price, 0) / monthlyServices.length;
    if (averageMonthlyPrice > 0) {
      targets.mrr = Math.ceil(sales * averageMonthlyPrice / 10) * 10;
      estimatedMetrics.push('mrr');
    }
  }
  return estimatedMetrics;
}

export type GoalSuggestionStatus = 'created' | 'updated' | 'unchanged' | 'no_history' | 'concurrent_change';

type ExistingGoalTargets = Partial<Record<`${GoalMetricKey}Target`, number | null>>;

export type GoalSuggestionResult = {
  kind: GoalPeriodKind;
  status: GoalSuggestionStatus;
  metricsSaved: number;
  unavailableMetrics: GoalMetricKey[];
  projectedMetrics: GoalMetricKey[];
  estimatedMetrics: GoalMetricKey[];
};

function unavailableMetrics(targets: Record<GoalMetricKey, number | null>, existing?: ExistingGoalTargets): GoalMetricKey[] {
  return metricKeys.filter((metric) => targets[metric] === null && existing?.[`${metric}Target`] == null);
}

type GoalSuggestionOptions = {
  refreshTargets?: boolean;
  overrides?: Partial<Record<GoalMetricKey, number>>;
};

async function planCycle(kind: GoalPeriodKind, current: GoalPeriodWindow, monthlyStartDay: number, now: Date, options: GoalSuggestionOptions): Promise<GoalSuggestionResult> {
  const key = { ownerId: OWNER_ID, periodKind: kind, periodStart: current.start };
  const existing = await prisma.goal.findUnique({ where: { ownerId_periodKind_periodStart: key } });

  const historyPeriods = await previousGoalPeriods(current, monthlyStartDay);
  const actuals = await getTeamGoalActualsByPeriod(historyPeriods, now);
  const targets = suggestTargets(actuals);
  const automation = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' }, select: { prospectingDailyLimit: true } });
  const dailyLimit = automation?.prospectingDailyLimit ?? 10;
  const approachesTarget = dailyLimit * countProspectingDays(current.start, current.end);
  targets.approaches = approachesTarget;
  let projectedMetrics: GoalMetricKey[] = [];
  if (options.refreshTargets) {
    const currentActuals = await getTeamGoalActualsByPeriod([current], now);
    if (currentActuals[0]) projectedMetrics = fillTargetsFromCurrentPace(targets, currentActuals[0], current, now);
  }
  const estimatedMetrics = estimateMissingTargets(targets, approachesTarget);
  const services = await prisma.serviceCatalogItem.findMany({
    where: { isActive: true },
    select: { price: true, billingType: true }
  });
  estimatedMetrics.push(...estimateFinancialTargets(targets, services.map((service) => ({
    price: Number(service.price),
    billingType: service.billingType
  }))));
  for (const [metric, target] of Object.entries(options.overrides ?? {}) as Array<[GoalMetricKey, number]>) {
    targets[metric] = target;
    const estimatedIndex = estimatedMetrics.indexOf(metric);
    if (estimatedIndex >= 0) estimatedMetrics.splice(estimatedIndex, 1);
  }
  const metricsToSave = existing
    ? metricKeys.filter((metric) => targets[metric] !== null
      && (options.refreshTargets || existing[`${metric}Target` as keyof typeof existing] == null)
      && existing[`${metric}Target` as keyof typeof existing] !== targets[metric]).length
    : metricKeys.filter((metric) => targets[metric] !== null).length;
  if (metricsToSave === 0) {
    return {
      kind,
      status: existing && metricKeys.some((metric) => existing[`${metric}Target` as keyof typeof existing] !== null)
        ? 'unchanged'
        : 'no_history',
      metricsSaved: 0,
      unavailableMetrics: unavailableMetrics(targets, existing ?? undefined),
      projectedMetrics,
      estimatedMetrics
    };
  }

  if (existing) {
    // Scheduled runs fill blank targets. Explicit chat requests refresh all
    // targets with available evidence while preserving custom goals.
    const proposedFields = targetFields(targets);
    const data = Object.fromEntries(metricKeys.flatMap((metric) => {
      const field = `${metric}Target` as `${GoalMetricKey}Target`;
      if (targets[metric] === null || (!options.refreshTargets && existing[field] != null)) return [];
      if (existing[field] === targets[metric]) return [];
      return [[field, proposedFields[field as keyof typeof proposedFields]]];
    })) as Partial<ReturnType<typeof targetFields>>;
    const update = await prisma.goal.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data
    });
    if (update.count === 1) revalidateGoals();
    return {
      kind,
      status: update.count === 1 ? 'updated' : 'concurrent_change',
      metricsSaved: update.count === 1 ? metricsToSave : 0,
      unavailableMetrics: unavailableMetrics(targets, existing),
      projectedMetrics,
      estimatedMetrics
    };
  }

  try {
    await prisma.goal.create({ data: { ...key, periodEnd: current.end, ...targetFields(targets), customGoals: [] } });
    revalidateGoals();
    return { kind, status: 'created', metricsSaved: metricsToSave, unavailableMetrics: unavailableMetrics(targets), projectedMetrics, estimatedMetrics };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { kind, status: 'concurrent_change', metricsSaved: 0, unavailableMetrics: unavailableMetrics(targets), projectedMetrics, estimatedMetrics };
    }
    throw error;
  }
}

export async function createDarwinGoalSuggestion(kind: GoalPeriodKind, now = new Date(), options: GoalSuggestionOptions = {}): Promise<GoalSuggestionResult> {
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
  return planCycle(kind, current, monthlyStartDay, now, options);
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
