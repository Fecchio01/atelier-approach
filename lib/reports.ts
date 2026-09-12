import { Channel, LeadStage } from '@prisma/client';

import { prisma } from './db';

export type ReportRange = { from: Date; to: Date; now?: Date };

export type WeeklyMonthlyReport = {
  period: { from: Date; to: Date };
  conversion: { approaches: number; wins: number; rate: number };
  channels: { channel: Channel; approaches: number; wins: number; conversionRate: number }[];
  funnel: { stage: LeadStage; leads: number }[];
  followUps: { pending: number; overdue: number };
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

export async function buildReport(range: ReportRange): Promise<WeeklyMonthlyReport> {
  const [leads, activities, followUps] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, stage: true, wonAt: true } }),
    prisma.activity.findMany({
      where: { createdAt: { gte: range.from, lt: range.to } },
      select: { leadId: true, channel: true, note: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.followUp.findMany({ where: { state: 'PENDING' }, select: { dueDate: true } })
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

  return {
    period: { from: range.from, to: range.to },
    conversion: { approaches: activities.length, wins: wins.length, rate: rate(wins.length, activities.length) },
    channels,
    funnel: Object.values(LeadStage).map((stage) => ({ stage, leads: leads.filter((lead) => lead.stage === stage).length })),
    followUps: { pending: followUps.length, overdue: followUps.filter((followUp) => followUp.dueDate < now).length },
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
