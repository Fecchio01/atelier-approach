export type MetricActivity = { actorId: string; createdAt: Date };

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
  activities: MetricActivity[];
  followUps: MetricFollowUp[];
};

export type WeeklyGoalInput = {
  ownerId: string | null;
  weekStart: Date;
  approachesTarget: number;
  revenueTarget: number;
};

export type DashboardRange = { start: Date; end: Date; now?: Date };

export type DashboardMetrics = {
  sales: number;
  mrr: number;
  approaches: number;
  won: number;
  goalProgress: { approaches: number; revenue: number };
  dueToday: MetricFollowUp[];
  overdue: MetricFollowUp[];
  personalResults: Record<string, { approaches: number; sales: number; won: number }>;
};

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

export function getDashboardMetrics(leads: MetricLead[], goals: WeeklyGoalInput[], range: DashboardRange): DashboardMetrics {
  const won = leads.filter((lead) => lead.stage === 'WON' && lead.activities.some((activity) => inRange(activity.createdAt, range)));
  const sales = won.reduce((total, lead) => total + Number(lead.saleValue ?? 0), 0);
  const mrr = won.reduce((total, lead) => total + Number(lead.mrr ?? 0), 0);
  const activities = leads.flatMap((lead) => lead.activities.filter((activity) => inRange(activity.createdAt, range)));
  const approaches = activities.length;
  const teamGoals = goals.filter((goal) => goal.ownerId === null && isSameDay(goal.weekStart, range.start));
  const approachesTarget = teamGoals.reduce((total, goal) => total + goal.approachesTarget, 0);
  const revenueTarget = teamGoals.reduce((total, goal) => total + goal.revenueTarget, 0);
  const now = range.now ?? new Date();
  const pendingFollowUps = leads.flatMap((lead) => lead.followUps.filter((followUp) => followUp.state === 'PENDING'));
  const personalResults: DashboardMetrics['personalResults'] = {};

  for (const activity of activities) {
    personalResults[activity.actorId] ??= { approaches: 0, sales: 0, won: 0 };
    personalResults[activity.actorId].approaches += 1;
  }

  for (const lead of won) {
    const actorId = lead.activities.filter((activity) => inRange(activity.createdAt, range)).at(-1)?.actorId;
    if (!actorId) continue;
    personalResults[actorId] ??= { approaches: 0, sales: 0, won: 0 };
    personalResults[actorId].sales += Number(lead.saleValue ?? 0);
    personalResults[actorId].won += 1;
  }

  return {
    sales,
    mrr,
    approaches,
    won: won.length,
    goalProgress: { approaches: progress(approaches, approachesTarget), revenue: progress(sales, revenueTarget) },
    dueToday: pendingFollowUps.filter((followUp) => isSameDay(followUp.dueDate, now)),
    overdue: pendingFollowUps.filter((followUp) => followUp.dueDate < now && !isSameDay(followUp.dueDate, now)),
    personalResults
  };
}

export async function upsertWeeklyGoal(input: WeeklyGoalInput) {
  const ownerId = input.ownerId ?? TEAM_GOAL_OWNER;
  return prisma.goal.upsert({
    where: { ownerId_weekStart: { ownerId, weekStart: input.weekStart } },
    create: { ...input, ownerId },
    update: { approachesTarget: input.approachesTarget, revenueTarget: input.revenueTarget }
  });
}
import { prisma } from './db';
