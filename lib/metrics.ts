import type { ActivityType, GoalPeriodKind, LeadStage, Prisma } from '@prisma/client';
import { prisma } from './db';
import { isInterestStage, isMeetingStage } from './funnel';
import { getLocalDayWindow, isSameLocalDay, type GoalPeriodWindow } from './goal-periods';
import type { CustomGoalMetric } from './custom-goals';

export type MetricActivity = { actorId: string; type?: ActivityType; createdAt: Date; note?: string };
export type MetricStageEvent = { actorId: string; toStage: LeadStage; createdAt: Date };
export type MetricSaleEvent = { actorId: string; saleValue: MetricNumber; mrr: MetricNumber; occurredAt: Date };

export type MetricFollowUp = {
  id?: string;
  dueDate: Date;
  completedAt?: Date | null;
  ownerId: string;
  state: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  lead?: { id: string; name: string | null };
};

type MetricNumber = string | number | { toString(): string };

export type MetricLead = {
  id: string;
  stage: string;
  saleValue: MetricNumber | null;
  mrr: MetricNumber | null;
  wonAt?: Date | null;
  wonById?: string | null;
  activities: MetricActivity[];
  stageHistory?: MetricStageEvent[];
  saleEvents?: MetricSaleEvent[];
  followUps: MetricFollowUp[];
};

export type DashboardRange = { start: Date; end: Date; now?: Date };

export type GoalMetricKey = 'approaches' | 'interests' | 'meetings' | 'sales' | 'revenue' | 'mrr' | 'followUpsCompleted' | 'conversionRate';
export type GoalMetricActuals = Record<GoalMetricKey, number>;
export type TeamGoalTargets = Record<GoalMetricKey, number | null>;
export type GoalMetricProgress = { actual: number; target: number | null; ratio: number | null };
export type GoalProgressByMetric = Record<GoalMetricKey, GoalMetricProgress>;

export type DashboardMetrics = {
  sales: number;
  mrr: number;
  approaches: number;
  won: number;
  interests: number;
  meetings: number;
  goalActuals: GoalMetricActuals;
  dueToday: MetricFollowUp[];
  overdue: MetricFollowUp[];
  upcoming: MetricFollowUp[];
  personalResults: Record<string, MemberResults>;
};

export type MemberResults = { approaches: number; interests: number; meetings: number; sales: number; won: number };

const TEAM_GOAL_OWNER = '__team__';

function inRange(date: Date, range: DashboardRange) {
  return date >= range.start && date < range.end;
}

export function getTeamGoalProgress(actuals: GoalMetricActuals, targets: TeamGoalTargets): GoalProgressByMetric {
  return Object.fromEntries(Object.keys(actuals).map((key) => {
    const metric = key as GoalMetricKey;
    const actual = actuals[metric];
    const target = targets[metric];
    const ratio = target !== null && target > 0 && !(metric === 'conversionRate' && actuals.approaches === 0)
      ? Math.round((actual / target) * 100) / 100
      : null;
    return [metric, { actual, target: target !== null && target > 0 ? target : null, ratio }];
  })) as GoalProgressByMetric;
}

export type GoalTargetRecord = {
  approachesTarget?: number | null;
  interestsTarget?: number | null;
  meetingsTarget?: number | null;
  salesTarget?: number | null;
  revenueTarget?: number | null;
  mrrTarget?: number | null;
  followUpsCompletedTarget?: number | null;
  conversionRateTarget?: number | null;
};

export function getTeamGoalTargets(goal?: GoalTargetRecord | null): TeamGoalTargets {
  return {
    approaches: goal?.approachesTarget ?? null,
    interests: goal?.interestsTarget ?? null,
    meetings: goal?.meetingsTarget ?? null,
    sales: goal?.salesTarget ?? null,
    revenue: goal?.revenueTarget ?? null,
    mrr: goal?.mrrTarget ?? null,
    followUpsCompleted: goal?.followUpsCompletedTarget ?? null,
    conversionRate: goal?.conversionRateTarget ?? null
  };
}

const emptyResults = (): MemberResults => ({ approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 });

function resultsFor(leads: MetricLead[], range: DashboardRange) {
  const personal: Record<string, MemberResults> = {};
  const member = (id: string) => personal[id] ??= emptyResults();
  let mrr = 0;
  let followUpsCompleted = 0;
  for (const lead of leads) {
    followUpsCompleted += lead.followUps.filter((followUp) => followUp.state === 'COMPLETED' && followUp.completedAt && inRange(followUp.completedAt, range)).length;
    for (const activity of lead.activities) {
      if ((activity.type === 'CONTACT' || !activity.type) && inRange(activity.createdAt, range)) member(activity.actorId).approaches += 1;
    }
    const history = lead.stageHistory?.length ? lead.stageHistory : (lead.activities ?? []).flatMap((activity) => {
      if (activity.type && activity.type !== 'STAGE_CHANGE') return [];
      // Untyped legacy records are accepted only with the system's exact transition note.
      const match = activity.note?.match(/^Etapa alterada para (INTEREST|IN_CONVERSATION|MEETING|FOLLOW_UP)\.$/);
      return match ? [{ actorId: activity.actorId, toStage: match[1] as LeadStage, createdAt: activity.createdAt }] : [];
    });
    for (const event of history) {
      if (!inRange(event.createdAt, range)) continue;
      if (isInterestStage(event.toStage)) member(event.actorId).interests += 1;
      if (isMeetingStage(event.toStage)) member(event.actorId).meetings += 1;
    }
    for (const sale of lead.saleEvents ?? []) {
      if (!inRange(sale.occurredAt, range)) continue;
      member(sale.actorId).sales += Number(sale.saleValue);
      member(sale.actorId).won += 1;
      mrr += Number(sale.mrr);
    }
    if (!(lead.saleEvents?.length) && lead.stage === 'WON' && lead.wonAt && inRange(lead.wonAt, range)) {
      const owner = lead.wonById ?? 'unknown';
      member(owner).sales += Number(lead.saleValue ?? 0);
      member(owner).won += 1;
      mrr += Number(lead.mrr ?? 0);
    }
  }
  const team = Object.values(personal).reduce<MemberResults>((total, result) => ({
    approaches: total.approaches + result.approaches,
    interests: total.interests + result.interests,
    meetings: total.meetings + result.meetings,
    sales: total.sales + result.sales,
    won: total.won + result.won
  }), emptyResults());
  return { personal, team, mrr, followUpsCompleted };
}

export function getDashboardMetrics(leads: MetricLead[], range: DashboardRange): DashboardMetrics {
  const { personal: personalResults, team: teamResults, mrr, followUpsCompleted } = resultsFor(leads, range);
  const now = range.now ?? new Date();
  const todayEnd = getLocalDayWindow(now).end;
  const pendingFollowUps = leads.flatMap((lead) => lead.followUps.filter((followUp) => followUp.state === 'PENDING'));

  return {
    sales: teamResults.sales,
    mrr,
    approaches: teamResults.approaches,
    interests: teamResults.interests,
    meetings: teamResults.meetings,
    won: teamResults.won,
    goalActuals: {
      approaches: teamResults.approaches,
      interests: teamResults.interests,
      meetings: teamResults.meetings,
      sales: teamResults.won,
      revenue: teamResults.sales,
      mrr,
      followUpsCompleted,
      conversionRate: teamResults.approaches ? Number((teamResults.won / teamResults.approaches * 100).toFixed(2)) : 0
    },
    dueToday: pendingFollowUps.filter((followUp) => isSameLocalDay(followUp.dueDate, now)),
    overdue: pendingFollowUps.filter((followUp) => followUp.dueDate < now && !isSameLocalDay(followUp.dueDate, now)),
    upcoming: pendingFollowUps.filter((followUp) => followUp.dueDate >= todayEnd)
      .sort((first, second) => first.dueDate.getTime() - second.dueDate.getTime())
      .slice(0, 5),
    personalResults
  };
}

export async function getTeamGoalActualsByPeriod(
  periods: GoalPeriodWindow[],
  now = new Date(),
  database: Prisma.TransactionClient | typeof prisma = prisma
): Promise<GoalMetricActuals[]> {
  if (periods.length === 0) return [];

  const dataFrom = periods.reduce((earliest, period) => period.start < earliest ? period.start : earliest, periods[0].start);
  const dataTo = periods.reduce((latest, period) => period.end > latest ? period.end : latest, periods[0].end);
  const [leads, activities, stageHistory, saleEvents, followUps] = await Promise.all([
    database.lead.findMany({ select: { id: true, stage: true, saleValue: true, mrr: true, wonAt: true, wonById: true } }),
    database.activity.findMany({
      where: { createdAt: { gte: dataFrom, lt: dataTo } },
      select: { leadId: true, actorId: true, type: true, createdAt: true, note: true },
      orderBy: { createdAt: 'asc' }
    }),
    database.stageHistory.findMany({
      where: { createdAt: { gte: dataFrom, lt: dataTo } },
      select: { leadId: true, actorId: true, toStage: true, createdAt: true }
    }),
    database.saleEvent.findMany({
      where: { occurredAt: { gte: dataFrom, lt: dataTo } },
      select: { leadId: true, actorId: true, saleValue: true, mrr: true, occurredAt: true }
    }),
    database.followUp.findMany({
      where: { state: 'COMPLETED', completedAt: { gte: dataFrom, lt: dataTo } },
      select: { leadId: true, dueDate: true, completedAt: true, ownerId: true, state: true }
    })
  ]);

  const byLead = <T extends { leadId: string }>(rows: T[]) => {
    const result = new Map<string, T[]>();
    for (const row of rows) result.set(row.leadId, [...(result.get(row.leadId) ?? []), row]);
    return result;
  };
  const activitiesByLead = byLead(activities);
  const historyByLead = byLead(stageHistory);
  const salesByLead = byLead(saleEvents);
  const followUpsByLead = byLead(followUps);
  const metricLeads: MetricLead[] = leads.map((lead) => ({
    ...lead,
    activities: activitiesByLead.get(lead.id) ?? [],
    stageHistory: historyByLead.get(lead.id) ?? [],
    saleEvents: salesByLead.get(lead.id) ?? [],
    followUps: followUpsByLead.get(lead.id) ?? []
  }));

  return periods.map((period) => getDashboardMetrics(metricLeads, { start: period.start, end: period.end, now }).goalActuals);
}

export async function upsertTeamGoal(
  period: GoalPeriodWindow,
  targets: TeamGoalTargets,
  database: Prisma.TransactionClient | typeof prisma = prisma,
  customGoals?: CustomGoalMetric[]
) {
  const targetFields = {
    approachesTarget: targets.approaches,
    interestsTarget: targets.interests,
    meetingsTarget: targets.meetings,
    salesTarget: targets.sales,
    revenueTarget: targets.revenue,
    mrrTarget: targets.mrr,
    followUpsCompletedTarget: targets.followUpsCompleted,
    conversionRateTarget: targets.conversionRate
  };
  const customGoalData = customGoals === undefined
    ? {}
    : { customGoals: customGoals as Prisma.InputJsonValue };
  const unique = { ownerId: TEAM_GOAL_OWNER, periodKind: period.kind as GoalPeriodKind, periodStart: period.start };
  return database.goal.upsert({
    where: { ownerId_periodKind_periodStart: unique },
    create: { ...unique, periodEnd: period.end, ...targetFields, ...customGoalData },
    update: { periodEnd: period.end, ...targetFields, ...customGoalData }
  });
}

export async function saveMonthlyStartDay(
  monthlyStartDay: number,
  database: Prisma.TransactionClient | typeof prisma = prisma
) {
  if (!Number.isInteger(monthlyStartDay) || monthlyStartDay < 1 || monthlyStartDay > 31) {
    throw new RangeError('O dia de início do ciclo mensal deve ser um inteiro entre 1 e 31.');
  }
  return database.teamGoalSettings.upsert({
    where: { id: 'team' },
    create: { id: 'team', monthlyStartDay },
    update: { monthlyStartDay }
  });
}
