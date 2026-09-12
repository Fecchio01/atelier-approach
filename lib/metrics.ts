import { prisma } from './db';

export type MetricActivity = { actorId: string; createdAt: Date; note?: string };

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

function stageEvent(activity: MetricActivity, stage: 'INTEREST' | 'FOLLOW_UP') {
  return activity.note === `Etapa alterada para ${stage}.`;
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
  const won = leads.filter((lead) => lead.stage === 'WON' && lead.wonAt && inRange(lead.wonAt, range));
  const sales = won.reduce((total, lead) => total + Number(lead.saleValue ?? 0), 0);
  const mrr = won.reduce((total, lead) => total + Number(lead.mrr ?? 0), 0);
  const activities = leads.flatMap((lead) => lead.activities.filter((activity) => inRange(activity.createdAt, range)));
  const approaches = activities.length;
  const goalWeekStart = range.goalWeekStart ?? range.start;
  const teamGoal = goals.find((goal) => goal.ownerId === null && isSameDay(goal.weekStart, goalWeekStart));
  const now = range.now ?? new Date();
  const pendingFollowUps = leads.flatMap((lead) => lead.followUps.filter((followUp) => followUp.state === 'PENDING'));
  const personalResults: DashboardMetrics['personalResults'] = {};

  for (const activity of activities) {
    personalResults[activity.actorId] ??= { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 };
    personalResults[activity.actorId].approaches += 1;
  }

  for (const lead of leads) {
    for (const activity of lead.activities.filter((entry) => inRange(entry.createdAt, range))) {
      personalResults[activity.actorId] ??= { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 };
      if (stageEvent(activity, 'INTEREST')) personalResults[activity.actorId].interests += 1;
      if (stageEvent(activity, 'FOLLOW_UP')) personalResults[activity.actorId].meetings += 1;
    }
  }

  for (const lead of won) {
    const actorId = lead.wonById;
    if (!actorId) continue;
    personalResults[actorId] ??= { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 };
    personalResults[actorId].sales += Number(lead.saleValue ?? 0);
    personalResults[actorId].won += 1;
  }

  const teamResults = Object.values(personalResults).reduce<MemberResults>((total, result) => ({
    approaches: total.approaches + result.approaches,
    interests: total.interests + result.interests,
    meetings: total.meetings + result.meetings,
    sales: total.sales + result.sales,
    won: total.won + result.won
  }), { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 });
  const personalGoalProgress = Object.fromEntries(Object.entries(personalResults).map(([ownerId, result]) => [ownerId, goalProgress(result, goals.find((goal) => goal.ownerId === ownerId && isSameDay(goal.weekStart, goalWeekStart)))]));

  return {
    sales,
    mrr,
    approaches,
    interests: teamResults.interests,
    meetings: teamResults.meetings,
    won: won.length,
    goalProgress: goalProgress(teamResults, teamGoal),
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
