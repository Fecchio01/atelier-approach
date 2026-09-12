import { Channel, LeadStage } from '@prisma/client';

import { prisma } from './db';

export type ReportRange = { from: Date; to: Date; now?: Date };
export type RecentReportPeriod = 'week' | 'month';

export type WeeklyMonthlyReport = {
  period: { from: Date; to: Date };
  conversion: { approaches: number; wins: number; rate: number };
  revenue: { sales: number; mrr: number };
  channels: { channel: Channel; approaches: number; wins: number; conversionRate: number }[];
  members: { memberId: string; approaches: number; interests: number; meetings: number; wins: number; sales: number; mrr: number }[];
  funnel: { stage: LeadStage; leads: number }[];
  followUps: { pending: number; completed: number; cancelled: number; overdue: number };
  notes: { total: number; recent: string[] };
};

export type Recommendation = {
  metric: 'followUpsOverdue' | 'conversionRate' | 'notesRecorded';
  direction: 'reduce' | 'increase';
  message: string;
  basis: string;
};

const inRange = (date: Date, { from, to }: ReportRange) => date >= from && date < to;
const rate = (numerator: number, denominator: number) => denominator ? Number((numerator / denominator).toFixed(2)) : 0;

export function getRecentReportRange(period: RecentReportPeriod, reference = new Date()): Pick<ReportRange, 'from' | 'to'> {
  const to = new Date(reference);
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (period === 'week' ? 7 : 30));
  return { from, to };
}

export async function buildReport(range: ReportRange): Promise<WeeklyMonthlyReport> {
  const [leads, activities, followUps, stageHistory] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, stage: true, wonAt: true, wonById: true, saleValue: true, mrr: true } }),
    prisma.activity.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { leadId: true, actorId: true, channel: true, note: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.followUp.findMany({ select: { dueDate: true, state: true } }),
    prisma.stageHistory.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { leadId: true, actorId: true, toStage: true }
    })
  ]);
  const wins = leads.filter((lead) => lead.wonAt && inRange(lead.wonAt, range));
  const winIds = new Set(wins.map((lead) => lead.id));
  const channels = Object.values(Channel).map((channel) => {
    const channelActivities = activities.filter((activity) => activity.channel === channel);
    const approachedLeadIds = new Set(channelActivities.map((activity) => activity.leadId));
    const channelWins = [...approachedLeadIds].filter((leadId) => winIds.has(leadId)).length;
    return { channel, approaches: channelActivities.length, wins: channelWins, conversionRate: rate(channelWins, channelActivities.length) };
  }).filter((channel) => channel.approaches > 0);
  const now = range.now ?? new Date();
  const memberResults = new Map<string, { approaches: number; interests: number; meetings: number; wins: number; sales: number; mrr: number }>();
  const member = (memberId: string) => {
    const existing = memberResults.get(memberId);
    if (existing) return existing;
    const created = { approaches: 0, interests: 0, meetings: 0, wins: 0, sales: 0, mrr: 0 };
    memberResults.set(memberId, created);
    return created;
  };

  const historyLeadIds = new Set(stageHistory.map((entry) => entry.leadId));
  for (const activity of activities) {
    const result = member(activity.actorId);
    result.approaches += 1;
    if (!historyLeadIds.has(activity.leadId) && activity.note === 'Etapa alterada para INTEREST.') result.interests += 1;
    if (!historyLeadIds.has(activity.leadId) && activity.note === 'Etapa alterada para FOLLOW_UP.') result.meetings += 1;
  }
  for (const entry of stageHistory) {
    const result = member(entry.actorId);
    if (entry.toStage === 'INTEREST') result.interests += 1;
    if (entry.toStage === 'FOLLOW_UP') result.meetings += 1;
  }
  for (const lead of wins) {
    if (!lead.wonById) continue;
    const result = member(lead.wonById);
    result.wins += 1;
    result.sales += Number(lead.saleValue ?? 0);
    result.mrr += Number(lead.mrr ?? 0);
  }

  return {
    period: { from: range.from, to: range.to },
    conversion: { approaches: activities.length, wins: wins.length, rate: rate(wins.length, activities.length) },
    revenue: {
      sales: wins.reduce((total, lead) => total + Number(lead.saleValue ?? 0), 0),
      mrr: wins.reduce((total, lead) => total + Number(lead.mrr ?? 0), 0)
    },
    channels,
    members: [...memberResults.entries()].map(([memberId, result]) => ({ memberId, ...result })).sort((first, second) => first.memberId.localeCompare(second.memberId)),
    funnel: Object.values(LeadStage).map((stage) => ({ stage, leads: leads.filter((lead) => lead.stage === stage).length })),
    followUps: {
      pending: followUps.filter((followUp) => followUp.state === 'PENDING').length,
      completed: followUps.filter((followUp) => followUp.state === 'COMPLETED').length,
      cancelled: followUps.filter((followUp) => followUp.state === 'CANCELLED').length,
      overdue: followUps.filter((followUp) => followUp.state === 'PENDING' && followUp.dueDate < now).length
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
