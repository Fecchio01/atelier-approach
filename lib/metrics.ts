import type { ActivityType, LeadStage } from '@prisma/client';
import { prisma } from './db';

export type MetricActivity = { actorId: string; type: ActivityType; createdAt: Date; note?: string };
export type MetricStageEvent = { actorId: string; toStage: LeadStage; createdAt: Date };
export type MetricSaleEvent = { actorId: string; saleValue: MetricNumber; mrr: MetricNumber; occurredAt: Date };

export type MetricFollowUp = {
  id?: string;
  dueDate: Date;
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
  stageHistory: MetricStageEvent[];
  saleEvents: MetricSaleEvent[];
  followUps: MetricFollowUp[];
};

export type WeeklyGoalInput = {
  ownerId: string | null;
  weekStart: Date;
  approachesTarget: number;
  interestsTarget?: number;
  meetingsTarget?: number;
  salesTarget?: number;
  revenueTarget: number;
};

export type DashboardRange = { start: Date; end: Date; now?: Date; goalWeekStart?: Date };

export type DashboardMetrics = {
  sales: number;
  mrr: number;
  approaches: number;
  won: number;
  interests: number;
  meetings: number;
  goalProgress: GoalProgress;
  dueToday: MetricFollowUp[];
  overdue: MetricFollowUp[];
  personalResults: Record<string, MemberResults>;
  personalGoalProgress: Record<string, GoalProgress>;
};

export type GoalProgress = { approaches: number; interests: number; meetings: number; sales: number; revenue: number };
export type MemberResults = { approaches: number; interests: number; meetings: number; sales: number; won: number };

const TEAM_GOAL_OWNER = '__team__';

function inRange(date: Date, range: DashboardRange) {
  return date >= range.start && date < range.end;
}

function progress(value: number, target: number) {
  return target > 0 ? Number((value / target).toFixed(2)) : 0;
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

const emptyResults = (): MemberResults => ({ approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 });

function resultsFor(leads: MetricLead[], range: DashboardRange) {
  const personal: Record<string, MemberResults> = {};
  const member = (id: string) => personal[id] ??= emptyResults();
  let mrr = 0;
  for (const lead of leads) {
    for (const activity of lead.activities) {
      if ((activity.type === 'CONTACT' || !activity.type) && inRange(activity.createdAt, range)) member(activity.actorId).approaches += 1;
    }
    const history = lead.stageHistory?.length ? lead.stageHistory : (lead.activities ?? []).flatMap((activity) => {
      const match = activity.note?.match(/INTEREST|FOLLOW_UP/);
      return match ? [{ actorId: activity.actorId, toStage: match[0] as LeadStage, createdAt: activity.createdAt }] : [];
    });
    for (const event of history) {
      if (!inRange(event.createdAt, range)) continue;
      if (event.toStage === 'INTEREST') member(event.actorId).interests += 1;
      if (event.toStage === 'FOLLOW_UP') member(event.actorId).meetings += 1;
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
  return { personal, team, mrr };
}

function goalProgress(results: MemberResults, goal?: WeeklyGoalInput): GoalProgress {
  return {
    approaches: progress(results.approaches, goal?.approachesTarget ?? 0),
    interests: progress(results.interests, goal?.interestsTarget ?? 0),
    meetings: progress(results.meetings, goal?.meetingsTarget ?? 0),
    sales: progress(results.won, goal?.salesTarget ?? 0),
    revenue: progress(results.sales, goal?.revenueTarget ?? 0)
  };
}

export function getDashboardMetrics(leads: MetricLead[], goals: WeeklyGoalInput[], range: DashboardRange): DashboardMetrics {
  const { personal: personalResults, team: teamResults, mrr } = resultsFor(leads, range);
  const goalWeekStart = range.goalWeekStart ?? range.start;
  const goalWeekEnd = new Date(goalWeekStart);
  goalWeekEnd.setDate(goalWeekEnd.getDate() + 7);
  const weekly = resultsFor(leads, { start: goalWeekStart, end: goalWeekEnd });
  const teamGoal = goals.find((goal) => goal.ownerId === null && isSameDay(goal.weekStart, goalWeekStart));
  const now = range.now ?? new Date();
  const pendingFollowUps = leads.flatMap((lead) => lead.followUps.filter((followUp) => followUp.state === 'PENDING'));
  const owners = new Set([...Object.keys(weekly.personal), ...goals.flatMap((goal) => goal.ownerId ? [goal.ownerId] : [])]);
  const personalGoalProgress = Object.fromEntries([...owners].map((ownerId) => [ownerId, goalProgress(weekly.personal[ownerId] ?? emptyResults(), goals.find((goal) => goal.ownerId === ownerId && isSameDay(goal.weekStart, goalWeekStart)))]));

  return {
    sales: teamResults.sales,
    mrr,
    approaches: teamResults.approaches,
    interests: teamResults.interests,
    meetings: teamResults.meetings,
    won: teamResults.won,
    goalProgress: goalProgress(weekly.team, teamGoal),
    dueToday: pendingFollowUps.filter((followUp) => isSameDay(followUp.dueDate, now)),
    overdue: pendingFollowUps.filter((followUp) => followUp.dueDate < now && !isSameDay(followUp.dueDate, now)),
    personalResults,
    personalGoalProgress
  };
}

export async function upsertWeeklyGoal(input: WeeklyGoalInput) {
  const ownerId = input.ownerId ?? TEAM_GOAL_OWNER;
  return prisma.goal.upsert({
    where: { ownerId_weekStart: { ownerId, weekStart: input.weekStart } },
    create: { ownerId, weekStart: input.weekStart, approachesTarget: input.approachesTarget, interestsTarget: input.interestsTarget ?? 0, meetingsTarget: input.meetingsTarget ?? 0, salesTarget: input.salesTarget ?? 0, revenueTarget: input.revenueTarget },
    update: { approachesTarget: input.approachesTarget, interestsTarget: input.interestsTarget ?? 0, meetingsTarget: input.meetingsTarget ?? 0, salesTarget: input.salesTarget ?? 0, revenueTarget: input.revenueTarget }
  });
}
