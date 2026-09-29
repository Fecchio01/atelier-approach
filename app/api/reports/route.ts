import { getCurrentUser } from '../../../lib/auth';
import { closeCurrentDailyReport, getDailyReportForDate } from '../../../lib/daily-reports';
import { buildRecommendations, buildReport, type DailyReportSnapshot, type WeeklyMonthlyReport } from '../../../lib/reports';
import { createReportPdf, type ReportPdfSection } from '../../../lib/report-pdf';
import { getMemberProfiles } from '../../../lib/member-profile';
import { getTeamGoalProgress, getTeamGoalTargets, type GoalMetricKey } from '../../../lib/metrics';
import { normalizeFunnelStage, stageLabels } from '../../../lib/funnel';
import { prisma } from '../../../lib/db';
import type { Channel } from '@prisma/client';

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
});
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
});
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const channelLabels: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'E-mail', INSTAGRAM: 'Instagram', IN_PERSON: 'Presencial', OTHER: 'Outro'
};
const activityLabels = {
  CONTACT: 'Abordagem registrada',
  STAGE_CHANGE: 'Etapa atualizada',
  FOLLOW_UP_SCHEDULED: 'Follow-up agendado',
  FOLLOW_UP_COMPLETED: 'Follow-up concluído',
  FOLLOW_UP_CANCELLED: 'Follow-up cancelado',
  SALE_WON: 'Negócio ganho',
  LEAD_REOPENED: 'Empresa reaberta',
  DISCARDED: 'Empresa descartada'
} as const;
const teamOwnerId = '__team__';
const goalSelect = {
  approachesTarget: true, interestsTarget: true, meetingsTarget: true,
  salesTarget: true, revenueTarget: true, mrrTarget: true,
  followUpsCompletedTarget: true, conversionRateTarget: true
} as const;
const metricLabels: Record<GoalMetricKey, string> = {
  approaches: 'Abordagens', interests: 'Interesses', meetings: 'Reuniões e retornos', sales: 'Vendas',
  revenue: 'Receita vendida', mrr: 'MRR', followUpsCompleted: 'Follow-ups concluídos', conversionRate: 'Conversão'
};

function localDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseLocalDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && localDateKey(parsed) === value ? parsed : null;
}

function parseInstant(value: string | null) {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function downloadPdf(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store'
    }
  });
}

function createDailyPdfSections(snapshot: DailyReportSnapshot): ReportPdfSection[] {
  const summary = snapshot.summary;
  return [
    { title: 'Resumo do dia', lines: [
      `Abordagens: ${summary.approaches}`,
      `Interesses: ${summary.interests}`,
      `Reuniões e retornos: ${summary.meetings}`,
      `Vendas: ${summary.sales}`,
      `Receita vendida: ${moneyFormatter.format(summary.revenue)}`,
      `MRR: ${moneyFormatter.format(summary.mrr)}`,
      `Follow-ups concluídos: ${summary.followUpsCompleted}`,
      `Conversão: ${numberFormatter.format(summary.conversionRate)}%`
    ] },
    { title: 'Atividades por canal', lines: summary.channels.map((item) =>
      `${channelLabels[item.channel]}: ${item.approaches} abordagens, ${item.wins} ganhos, ${numberFormatter.format(item.conversionRate * 100)}% de conversão`
    ) },
    { title: 'Desempenho da equipe', lines: summary.members.map((member) =>
      `${member.memberName ?? member.memberId}: ${member.approaches} abordagens, ${member.interests} interesses, ${member.meetings} reuniões, ${member.wins} vendas, ${moneyFormatter.format(member.revenue)} em receita, ${moneyFormatter.format(member.mrr)} de MRR`
    ) },
    { title: 'Ações do dia', lines: snapshot.actions.map((action) => {
      const details = [action.actorName, action.channel ? channelLabels[action.channel] : null].filter(Boolean).join(' - ');
      return [
        `${timeFormatter.format(new Date(action.occurredAt))} - ${activityLabels[action.type]} - ${action.leadName}`,
        details,
        action.note ? `Nota: ${action.note}` : null
      ].filter(Boolean).join(' | ');
    }) }
  ];
}

async function createPeriodPdfSections(period: 'week' | 'month', report: WeeklyMonthlyReport, from: Date) {
  const kind = period === 'week' ? 'WEEKLY' : 'MONTHLY';
  const [goal, profiles] = await Promise.all([
    prisma.goal.findFirst({ where: { ownerId: teamOwnerId, periodKind: kind, periodStart: from }, select: goalSelect }),
    getMemberProfiles()
  ]);
  const targets = getTeamGoalTargets(goal);
  const progress = getTeamGoalProgress(report.goalActuals, targets);
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile.name]));
  const formatMetric = (key: GoalMetricKey, value: number) => key === 'revenue' || key === 'mrr'
    ? moneyFormatter.format(value)
    : key === 'conversionRate' ? `${numberFormatter.format(value)}%` : numberFormatter.format(value);
  const goalRows = (Object.keys(metricLabels) as GoalMetricKey[]).map((key) => {
    const item = progress[key];
    const target = item.target === null ? 'sem meta' : formatMetric(key, item.target);
    const ratio = item.ratio === null ? '' : ` - ${Math.round(item.ratio * 100)}% da meta`;
    return `${metricLabels[key]}: ${formatMetric(key, item.actual)} / ${target}${ratio}`;
  });
  const recommendations = buildRecommendations(report);
  return [
    { title: 'Meta da equipe', lines: goalRows },
    { title: 'Resumo do período', lines: [
      `Abordagens: ${report.conversion.approaches}`,
      `Interesses: ${report.goalActuals.interests}`,
      `Reuniões e retornos: ${report.goalActuals.meetings}`,
      `Ganhos: ${report.conversion.wins}`,
      `Conversão: ${report.conversion.approaches ? `${Math.round(report.conversion.rate * 100)}%` : 'sem abordagens'}`,
      `Receita vendida: ${moneyFormatter.format(report.revenue.sales)}`,
      `MRR: ${moneyFormatter.format(report.revenue.mrr)}`,
      `Follow-ups: ${report.followUps.pending} pendentes, ${report.followUps.completed} concluídos, ${report.followUps.cancelled} cancelados, ${report.followUps.overdue} vencidos`
    ] },
    { title: 'Por canal', lines: report.channels.map((item) =>
      `${channelLabels[item.channel]}: ${item.approaches} abordagens, ${item.wins} ganhos, ${Math.round(item.conversionRate * 100)}% de conversão`
    ) },
    { title: 'Funil atual', lines: report.funnel.map((item) =>
      `${stageLabels[normalizeFunnelStage(item.stage)]}: ${item.leads} empresas`
    ) },
    { title: 'Por membro', lines: report.members.map((item) =>
      `${profilesById.get(item.memberId) ?? item.memberId}: ${item.approaches} abordagens, ${item.interests} interesses, ${item.meetings} reuniões, ${item.wins} vendas, ${moneyFormatter.format(item.sales)} em receita, ${moneyFormatter.format(item.mrr)} de MRR`
    ) },
    { title: 'Resumo de anotações', lines: [
      `${report.notes.total} anotação(ões) registrada(s) no período.`,
      ...report.notes.recent.slice(0, 8).map((note) => `Nota: ${note}`)
    ] },
    { title: 'Pontos de atenção', lines: recommendations.length
      ? recommendations.map((item) => `${item.message} Base: ${item.basis}`)
      : ['Nenhum ponto de atenção disparado pelas regras atuais.'] }
  ];
}

async function exportPdf(searchParams: URLSearchParams) {
  const period = searchParams.get('period');
  const exportedAt = new Date();

  if (period === 'day') {
    const reference = parseLocalDate(searchParams.get('date'));
    if (!reference) return Response.json({ error: 'Informe uma data diária válida.' }, { status: 400 });
    const report = await getDailyReportForDate(reference);
    if (!report) return Response.json({ error: 'Feche o dia antes de exportar o relatório diário.' }, { status: 404 });
    const date = localDateKey(report.dayStart);
    const bytes = await createReportPdf({
      title: 'Relatório diário',
      subtitle: `Data: ${dateFormatter.format(report.dayStart)} - Fechado às ${timeFormatter.format(report.closedAt)}`,
      exportedAt,
      sections: createDailyPdfSections(report.snapshot)
    });
    return downloadPdf(bytes, `relatorio-diario-${date}.pdf`);
  }

  if (period !== 'week' && period !== 'month') {
    return Response.json({ error: 'Escolha o período diário, semanal ou mensal.' }, { status: 400 });
  }
  const from = parseInstant(searchParams.get('from'));
  const to = parseInstant(searchParams.get('to'));
  const maximumPeriodLength = period === 'week' ? 9 : 35;
  if (!from || !to || from >= to || to.getTime() - from.getTime() > maximumPeriodLength * 24 * 60 * 60 * 1000) {
    return Response.json({ error: 'Informe um período semanal ou mensal válido.' }, { status: 400 });
  }

  const report = await buildReport({ from, to });
  const kind = period === 'week' ? 'WEEKLY' : 'MONTHLY';
  const sections = await createPeriodPdfSections(period, report, from);
  const kindLabel = period === 'week' ? 'semanal' : 'mensal';
  const rangeLabel = `${dateFormatter.format(from)} a ${dateFormatter.format(new Date(to.getTime() - 1))}`;
  const bytes = await createReportPdf({
    title: `Relatório ${kindLabel}`,
    subtitle: `Período: ${rangeLabel} - ${kind === 'WEEKLY' ? 'semana de segunda a domingo' : 'ciclo mensal configurado pela equipe'}`,
    exportedAt,
    sections
  });
  const rangeStart = localDateKey(from);
  const rangeEnd = localDateKey(new Date(to.getTime() - 1));
  return downloadPdf(bytes, `relatorio-${kindLabel}-${rangeStart}-${rangeEnd}.pdf`);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('format') === 'pdf') return exportPdf(searchParams);

  const from = parseDate(searchParams.get('from'));
  const to = parseDate(searchParams.get('to'));
  if (!from || !to || from >= to) {
    return Response.json({ error: 'Informe um período válido com datas inicial e final.' }, { status: 400 });
  }

  const report = await buildReport({ from, to });
  return Response.json({ report, recommendations: buildRecommendations(report) });
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const result = await closeCurrentDailyReport(user.id);
    return Response.json(result);
  } catch {
    return Response.json({ error: 'Não foi possível fechar o dia. Tente novamente.' }, { status: 500 });
  }
}
