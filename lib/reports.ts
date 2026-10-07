import { ActivityType, Channel, LeadStage, Prisma } from '@prisma/client';

import { prisma } from './db';
import { auxiliaryFunnelStages, isInterestStage, isMeetingStage, mainFunnelStages, normalizeFunnelStage } from './funnel';
import { getGoalPeriodWindow } from './goal-periods';
import type { GoalMetricActuals } from './metrics';

export type ReportRange = { from: Date; to: Date; now?: Date };
export type RecentReportPeriod = 'week' | 'month';

export type WeeklyMonthlyReport = {
  period: { from: Date; to: Date };
  goalActuals: GoalMetricActuals;
  conversion: { approaches: number; wins: number; rate: number };
  revenue: { sales: number; mrr: number };
  channels: { channel: Channel; approaches: number; wins: number; conversionRate: number }[];
  members: { memberId: string; approaches: number; interests: number; meetings: number; wins: number; sales: number; mrr: number }[];
  funnel: { stage: LeadStage; leads: number }[];
  followUps: { pending: number; completed: number; cancelled: number; overdue: number };
  notes: { total: number; recent: string[] };
};

export type DailyReportAction = {
  id: string;
  type: ActivityType;
  leadId: string;
  leadName: string;
  channel: Channel | null;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  note: string | null;
};

export type DailyReportSnapshot = {
  summary: {
    approaches: number;
    interests: number;
    meetings: number;
    sales: number;
    revenue: number;
    mrr: number;
    followUpsCompleted: number;
    conversionRate: number;
    channels: { channel: Channel; approaches: number; wins: number; conversionRate: number }[];
    members: {
      memberId: string;
      memberName: string | null;
      approaches: number;
      interests: number;
      meetings: number;
      wins: number;
      revenue: number;
      mrr: number;
    }[];
  };
  actions: DailyReportAction[];
};

export type Recommendation = {
  metric: 'followUpsOverdue' | 'conversionRate' | 'notesRecorded';
  direction: 'reduce' | 'increase';
  message: string;
  basis: string;
};

const inRange = (date: Date, { from, to }: ReportRange) => date >= from && date < to;
const rate = (numerator: number, denominator: number) => denominator ? Number((numerator / denominator).toFixed(2)) : 0;

export function getRecentReportRange(period: RecentReportPeriod, reference = new Date(), monthlyStartDay = 1): Pick<ReportRange, 'from' | 'to'> {
  const window = getGoalPeriodWindow(period === 'week' ? 'WEEKLY' : 'MONTHLY', reference, monthlyStartDay);
  return { from: window.start, to: window.end };
}

export async function buildDailyReportSnapshot({ from, to, closedAt }: { from: Date; to: Date; closedAt: Date }): Promise<DailyReportSnapshot> {
  const eventRange = { gte: from, lt: to, lte: closedAt };
  return prisma.$transaction(async (tx) => {
    const [leads, activities, followUps, saleEvents, stageHistory] = await Promise.all([
      tx.lead.findMany({
        where: { stage: 'WON', wonAt: eventRange },
        select: { id: true, saleValue: true, mrr: true, wonAt: true, wonById: true }
      }),
      tx.activity.findMany({
        where: { createdAt: eventRange },
        select: {
          id: true, leadId: true, actorId: true, type: true, channel: true, note: true, createdAt: true,
          lead: { select: { name: true } }
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      }),
      tx.followUp.findMany({
        where: { state: 'COMPLETED', completedAt: eventRange },
        select: { completedAt: true }
      }),
      tx.saleEvent.findMany({
        where: { occurredAt: eventRange, reversedAt: null },
        select: { leadId: true, actorId: true, saleValue: true, mrr: true, occurredAt: true }
      }),
      tx.stageHistory.findMany({
        where: { createdAt: eventRange },
        select: { actorId: true, toStage: true }
      })
    ]);

    const legacyCandidates = leads.filter((lead) => lead.wonAt);
    const historicalEventLeadIds = legacyCandidates.length ? new Set((await tx.saleEvent.findMany({
      where: { leadId: { in: legacyCandidates.map((lead) => lead.id) } },
      select: { leadId: true }
    })).map((sale) => sale.leadId)) : new Set<string>();
    const legacyWins = legacyCandidates.filter((lead) => !historicalEventLeadIds.has(lead.id)).map((lead) => ({
      leadId: lead.id,
      actorId: lead.wonById ?? 'unknown',
      saleValue: lead.saleValue ?? 0,
      mrr: lead.mrr ?? 0,
      occurredAt: lead.wonAt!
    }));
    const effectiveWins = [...saleEvents, ...legacyWins];
    const approaches = activities.filter((activity) => activity.type === 'CONTACT' || !activity.type);
    const interests = stageHistory.filter((event) => isInterestStage(event.toStage)).length;
    const meetings = stageHistory.filter((event) => isMeetingStage(event.toStage)).length;
    const completedFollowUps = followUps.length;
    const winLeadIds = [...new Set(effectiveWins.map((sale) => sale.leadId))];
    const latestWinAt = effectiveWins.reduce<Date | null>((latest, sale) => !latest || sale.occurredAt > latest ? sale.occurredAt : latest, null);
    const contacts = winLeadIds.length && latestWinAt ? await tx.activity.findMany({
      where: { type: 'CONTACT', leadId: { in: winLeadIds }, createdAt: { lte: latestWinAt } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { leadId: true, channel: true, createdAt: true }
    }) : [];
    const winChannels = effectiveWins.map((sale) => contacts.find((contact) => contact.leadId === sale.leadId && contact.createdAt <= sale.occurredAt)?.channel);
    const channels = Object.values(Channel).map((channel) => {
      const channelApproaches = approaches.filter((activity) => activity.channel === channel);
      const channelWins = winChannels.filter((winChannel) => winChannel === channel).length;
      return { channel, approaches: channelApproaches.length, wins: channelWins, conversionRate: rate(channelWins, channelApproaches.length) };
    }).filter((channel) => channel.approaches > 0 || channel.wins > 0);

    const memberResults = new Map<string, { approaches: number; interests: number; meetings: number; wins: number; revenue: number; mrr: number }>();
    const member = (memberId: string) => {
      const existing = memberResults.get(memberId);
      if (existing) return existing;
      const created = { approaches: 0, interests: 0, meetings: 0, wins: 0, revenue: 0, mrr: 0 };
      memberResults.set(memberId, created);
      return created;
    };
    for (const activity of approaches) member(activity.actorId).approaches += 1;
    for (const event of stageHistory) {
      if (isInterestStage(event.toStage)) member(event.actorId).interests += 1;
      if (isMeetingStage(event.toStage)) member(event.actorId).meetings += 1;
    }
    for (const sale of effectiveWins) {
      const result = member(sale.actorId);
      result.wins += 1;
      result.revenue += Number(sale.saleValue);
      result.mrr += Number(sale.mrr);
    }

    const memberIds = [...new Set([...memberResults.keys(), ...activities.map((activity) => activity.actorId)])];
    const memberProfiles = memberIds.length ? await tx.memberProfile.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true } }) : [];
    const memberNames = new Map(memberProfiles.map((profile) => [profile.id, profile.name]));
    const revenue = effectiveWins.reduce((total, sale) => total + Number(sale.saleValue ?? 0), 0);
    const mrr = effectiveWins.reduce((total, sale) => total + Number(sale.mrr ?? 0), 0);

    return {
      summary: {
        approaches: approaches.length,
        interests,
        meetings,
        sales: effectiveWins.length,
        revenue,
        mrr,
        followUpsCompleted: completedFollowUps,
        conversionRate: approaches.length ? Number((effectiveWins.length / approaches.length * 100).toFixed(2)) : 0,
        channels,
        members: [...memberResults.entries()].map(([memberId, result]) => ({
          memberId,
          memberName: memberNames.get(memberId) ?? null,
          ...result
        })).sort((first, second) => first.memberId.localeCompare(second.memberId))
      },
      actions: activities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        leadId: activity.leadId,
        leadName: activity.lead.name?.trim() || 'Empresa sem nome',
        channel: activity.channel,
        occurredAt: activity.createdAt.toISOString(),
        actorId: activity.actorId,
        actorName: memberNames.get(activity.actorId) ?? null,
        note: activity.note
      }))
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function buildReport(range: ReportRange): Promise<WeeklyMonthlyReport> {
  const [leads, activities, followUps, wins, stageHistory] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, stage: true, saleValue: true, mrr: true, wonAt: true, wonById: true } }),
    prisma.activity.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { leadId: true, actorId: true, type: true, channel: true, note: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.followUp.findMany({
      where: { OR: [
        { dueDate: { gte: range.from, lt: range.to } },
        { completedAt: { gte: range.from, lt: range.to } },
        { cancelledAt: { gte: range.from, lt: range.to } }
      ] },
      select: { dueDate: true, state: true, completedAt: true, cancelledAt: true }
    }),
    prisma.saleEvent.findMany({ where: { occurredAt: { gte: range.from, lt: range.to }, reversedAt: null } }),
    prisma.stageHistory.findMany({ where: { createdAt: { gte: range.from, lt: range.to } } })
  ]);
  const approaches = activities.filter((activity) => activity.type === 'CONTACT' || !activity.type);
  const interests = stageHistory.filter((event) => isInterestStage(event.toStage)).length;
  const meetings = stageHistory.filter((event) => isMeetingStage(event.toStage)).length;
  const legacyCandidates = leads.filter((lead) => lead.stage === 'WON' && lead.wonAt && inRange(lead.wonAt, range));
  const historicalEventLeadIds = legacyCandidates.length ? new Set((await prisma.saleEvent.findMany({
    where: { leadId: { in: legacyCandidates.map((lead) => lead.id) } },
    select: { leadId: true }
  })).map((sale) => sale.leadId)) : new Set<string>();
  const legacyWins = legacyCandidates.filter((lead) => !historicalEventLeadIds.has(lead.id)).map((lead) => ({ actorId: lead.wonById ?? 'unknown', leadId: lead.id, saleValue: lead.saleValue ?? 0, mrr: lead.mrr ?? 0, occurredAt: lead.wonAt! }));
  const effectiveWins = [...wins, ...legacyWins];
  const winLeadIds = [...new Set(effectiveWins.map((sale) => sale.leadId))];
  const latestWinAt = effectiveWins.reduce<Date | null>((latest, sale) => !latest || sale.occurredAt > latest ? sale.occurredAt : latest, null);
  const contacts = winLeadIds.length && latestWinAt ? await prisma.activity.findMany({
    where: { type: 'CONTACT', leadId: { in: winLeadIds }, createdAt: { lt: latestWinAt } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { leadId: true, channel: true, createdAt: true }
  }) : [];
  // Attribute each immutable sale once, to the last contact at or before its occurrence.
  const winChannels = effectiveWins.map((sale) => contacts.find((contact) => contact.leadId === sale.leadId && contact.createdAt <= sale.occurredAt)?.channel);
  const channels = Object.values(Channel).map((channel) => {
    const channelActivities = approaches.filter((activity) => activity.channel === channel);
    const channelWins = winChannels.filter((winChannel) => winChannel === channel).length;
    return { channel, approaches: channelActivities.length, wins: channelWins, conversionRate: rate(channelWins, channelActivities.length) };
  }).filter((channel) => channel.approaches > 0 || channel.wins > 0);
  const now = range.now ?? new Date();
  const memberResults = new Map<string, { approaches: number; interests: number; meetings: number; wins: number; sales: number; mrr: number }>();
  const member = (memberId: string) => {
    const existing = memberResults.get(memberId);
    if (existing) return existing;
    const created = { approaches: 0, interests: 0, meetings: 0, wins: 0, sales: 0, mrr: 0 };
    memberResults.set(memberId, created);
    return created;
  };

  for (const activity of approaches) {
    const result = member(activity.actorId);
    result.approaches += 1;
  }
  for (const event of stageHistory) {
    if (isInterestStage(event.toStage)) member(event.actorId).interests += 1;
    if (isMeetingStage(event.toStage)) member(event.actorId).meetings += 1;
  }
  for (const sale of effectiveWins) {
    const result = member(sale.actorId);
    result.wins += 1;
    result.sales += Number(sale.saleValue);
    result.mrr += Number(sale.mrr);
  }

  return {
    period: { from: range.from, to: range.to },
    goalActuals: {
      approaches: approaches.length,
      interests,
      meetings,
      sales: effectiveWins.length,
      revenue: effectiveWins.reduce((total, lead) => total + Number(lead.saleValue ?? 0), 0),
      mrr: effectiveWins.reduce((total, lead) => total + Number(lead.mrr ?? 0), 0),
      followUpsCompleted: followUps.filter((followUp) => followUp.state === 'COMPLETED' && followUp.completedAt && inRange(followUp.completedAt, range)).length,
      conversionRate: approaches.length ? Number((effectiveWins.length / approaches.length * 100).toFixed(2)) : 0
    },
    conversion: { approaches: approaches.length, wins: effectiveWins.length, rate: rate(effectiveWins.length, approaches.length) },
    revenue: {
      sales: effectiveWins.reduce((total, lead) => total + Number(lead.saleValue ?? 0), 0),
      mrr: effectiveWins.reduce((total, lead) => total + Number(lead.mrr ?? 0), 0)
    },
    channels,
    members: [...memberResults.entries()].map(([memberId, result]) => ({ memberId, ...result })).sort((first, second) => first.memberId.localeCompare(second.memberId)),
    funnel: [...mainFunnelStages, ...auxiliaryFunnelStages].map((stage) => ({ stage, leads: leads.filter((lead) => normalizeFunnelStage(lead.stage) === stage).length })),
    followUps: {
      pending: followUps.filter((followUp) => followUp.state === 'PENDING' && inRange(followUp.dueDate, range)).length,
      completed: followUps.filter((followUp) => followUp.state === 'COMPLETED' && followUp.completedAt && inRange(followUp.completedAt, range)).length,
      cancelled: followUps.filter((followUp) => followUp.state === 'CANCELLED' && followUp.cancelledAt && inRange(followUp.cancelledAt, range)).length,
      overdue: followUps.filter((followUp) => followUp.state === 'PENDING' && followUp.dueDate < now && inRange(followUp.dueDate, range)).length
    },
    notes: { total: activities.length, recent: activities.map((activity) => activity.note) }
  };
}

export function buildRecommendations(report: WeeklyMonthlyReport): Recommendation[] {
  const recommendations: Recommendation[] = [];
  if (report.followUps.overdue > 0) {
    recommendations.push({
      metric: 'followUpsOverdue', direction: 'reduce',
      message: `${report.followUps.overdue} follow-up${report.followUps.overdue === 1 ? ' está' : 's estão'} atrasado${report.followUps.overdue === 1 ? '.' : 's.'}`,
      basis: 'Contagem de follow-ups pendentes com vencimento anterior ao momento da consulta.'
    });
  }
  if (report.conversion.approaches > 0 && report.conversion.wins === 0) {
    recommendations.push({
      metric: 'conversionRate', direction: 'increase',
      message: 'Nenhum ganho foi registrado no período selecionado.',
      basis: `0 ganhos para ${report.conversion.approaches} abordagens registradas no CRM.`
    });
  }
  if (report.notes.total === 0) {
    recommendations.push({
      metric: 'notesRecorded', direction: 'increase',
      message: 'Registre anotações nas abordagens para manter o histórico comercial utilizável.',
      basis: 'Nenhuma atividade com anotação foi encontrada no período selecionado.'
    });
  }
  return recommendations;
}
