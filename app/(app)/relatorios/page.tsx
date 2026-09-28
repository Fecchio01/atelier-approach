import Link from 'next/link';

import { TeamGoalProgress } from '@/components/team-goal-progress';
import { PageHeading } from '@/components/ui';
import { getMemberProfiles } from '@/lib/member-profile';
import { normalizeFunnelStage, stageLabels } from '@/lib/funnel';
import { getTeamGoalProgress, getTeamGoalTargets } from '@/lib/metrics';
import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, selectGoalPeriod, type GoalPeriodWindow } from '@/lib/goal-periods';
import { buildRecommendations, buildReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month';
const teamOwnerId = '__team__';
const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

function parsePeriodStart(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function dateRangeLabel(window: GoalPeriodWindow) {
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date.format(window.start)} a ${date.format(new Date(window.end.getTime() - 1))}`;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string; start?: string }> }) {
  const { period: requestedPeriod, start: requestedStart } = await searchParams;
  const period: Period = requestedPeriod === 'month' ? 'month' : 'week';
  const kind = period === 'week' ? 'WEEKLY' : 'MONTHLY';
  const now = new Date();
  const start = parsePeriodStart(requestedStart);
  const goalSelect = {
    periodKind: true, periodStart: true, periodEnd: true,
    approachesTarget: true, interestsTarget: true, meetingsTarget: true,
    salesTarget: true, revenueTarget: true, mrrTarget: true,
    followUpsCompletedTarget: true, conversionRateTarget: true
  } as const;
  const [settings, activeGoal, requestedGoal, profiles] = await Promise.all([
    prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }),
    prisma.goal.findFirst({
      where: { ownerId: teamOwnerId, periodKind: kind, periodStart: { lte: now }, periodEnd: { gt: now } },
      select: goalSelect,
      orderBy: { periodStart: 'desc' }
    }),
    start ? prisma.goal.findFirst({ where: { ownerId: teamOwnerId, periodKind: kind, periodStart: start }, select: goalSelect }) : Promise.resolve(null),
    getMemberProfiles()
  ]);

  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const activeWindow: GoalPeriodWindow = activeGoal
    ? { kind, start: activeGoal.periodStart, end: activeGoal.periodEnd }
    : getGoalPeriodWindow(kind, now, monthlyStartDay);
  const selectedGoal = selectGoalPeriod(start, requestedGoal, activeGoal);
  const selectedWindow: GoalPeriodWindow = selectedGoal ? { kind, start: selectedGoal.periodStart, end: selectedGoal.periodEnd } : activeWindow;
  const [report] = await Promise.all([buildReport({ from: selectedWindow.start, to: selectedWindow.end })]);
  const recommendations = buildRecommendations(report);
  const nameFor = (memberId: string) => profiles.find((profile) => profile.id === memberId)?.name ?? memberId;
  const progress = getTeamGoalProgress(report.goalActuals, getTeamGoalTargets(selectedGoal));
  const viewingCurrent = selectedWindow.start.getTime() === activeWindow.start.getTime();
  const [previousGoal, nextGoal] = await Promise.all([
    prisma.goal.findFirst({
      where: { ownerId: teamOwnerId, periodKind: kind, periodStart: { lt: selectedWindow.start } },
      select: goalSelect,
      orderBy: { periodStart: 'desc' }
    }),
    prisma.goal.findFirst({
      where: { ownerId: teamOwnerId, periodKind: kind, periodStart: { gt: selectedWindow.start, lte: activeWindow.start } },
      select: goalSelect,
      orderBy: { periodStart: 'asc' }
    })
  ]);

  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
    <PageHeading eyebrow="Relatórios comerciais" title="Leituras do CRM, sem previsões." description="Os números usam atividades, etapas e eventos de ganho registrados no CRM." action={<Link href="/" className="text-sm text-[var(--atelier-green)]">← Painel</Link>} />
    <nav aria-label="Período do relatório" className="mt-8 flex flex-wrap gap-3">
      <Link href="/relatorios?period=week" className={`rounded-md px-4 py-2 text-sm font-semibold ${period === 'week' && viewingCurrent ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>Esta semana</Link>
      <Link href="/relatorios?period=month" className={`rounded-md px-4 py-2 text-sm font-semibold ${period === 'month' && viewingCurrent ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>Ciclo atual</Link>
    </nav>
    <nav aria-label="Navegar pelos ciclos salvos" className="mt-4 flex flex-wrap gap-3 text-xs">
      {previousGoal ? <Link href={`/relatorios?period=${period}&start=${encodeURIComponent(previousGoal.periodStart.toISOString())}`} className="rounded-full border border-white/15 px-3 py-1 hover:border-[var(--atelier-green)]">← Anterior · {dateRangeLabel({ kind, start: previousGoal.periodStart, end: previousGoal.periodEnd })}</Link> : null}
      {nextGoal ? <Link href={`/relatorios?period=${period}&start=${encodeURIComponent(nextGoal.periodStart.toISOString())}`} className="rounded-full border border-white/15 px-3 py-1 hover:border-[var(--atelier-green)]">Próximo · {dateRangeLabel({ kind, start: nextGoal.periodStart, end: nextGoal.periodEnd })} →</Link> : null}
      {!viewingCurrent ? <Link href={`/relatorios?period=${period}`} className="rounded-full border border-white/15 px-3 py-1 hover:border-[var(--atelier-green)]">Voltar ao ciclo atual</Link> : null}
    </nav>
    {start && !requestedGoal ? <p role="status" className="mt-5 text-sm text-amber-200">Esse ciclo salvo não foi encontrado. Exibindo o período atual.</p> : null}
    <p className="mt-5 text-sm text-white/65">Período analisado: <strong className="text-white">{dateRangeLabel(selectedWindow)}</strong>{selectedGoal ? ' · meta salva' : ' · sem meta configurada'}</p>

    <section aria-labelledby="goal-comparison-title" className="mt-6 rounded-2xl border border-white/[0.09] bg-[#111411] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="goal-comparison-title" className="text-xl font-semibold">Meta da equipe · realizado x alvo</h2><p className="mt-1 text-sm text-white/60">{period === 'week' ? 'Semana de segunda a domingo' : `Ciclo iniciado no dia ${monthlyStartDay}`}</p></div><Link href="/metas" className="text-sm text-[var(--atelier-green)]">Editar metas</Link></div>
      <div className="mt-5"><TeamGoalProgress progress={progress} hasApproaches={report.goalActuals.approaches > 0} /></div>
    </section>

    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Abordagens" value={String(report.conversion.approaches)} detail="Atividades no período" />
      <Metric label="Interesses" value={String(report.goalActuals.interests)} detail="Mudanças de etapa registradas" />
      <Metric label="Reuniões / retornos" value={String(report.goalActuals.meetings)} detail="Avanços para follow-up" />
      <Metric label="Ganhos" value={String(report.conversion.wins)} detail="Eventos WON no período" />
      <Metric label="Conversão" value={report.conversion.approaches ? percent(report.conversion.rate) : '—'} detail="Ganhos ÷ abordagens" />
      <Metric label="Receita vendida" value={money(report.revenue.sales)} detail="Valores de eventos WON no período" />
      <Metric label="MRR" value={money(report.revenue.mrr)} detail="MRR de eventos WON no período" />
      <Metric label="Follow-ups concluídos" value={String(report.followUps.completed)} detail="Contados pela data de conclusão" />
      <Metric label="Follow-ups pendentes" value={String(report.followUps.pending)} detail={`${report.followUps.overdue} vencido${report.followUps.overdue === 1 ? '' : 's'} · ${report.followUps.cancelled} cancelado${report.followUps.cancelled === 1 ? '' : 's'}`} />
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <ReportTable title="Por canal" headers={['Canal', 'Abordagens', 'Ganhos', 'Conversão']} rows={report.channels.map((item) => [item.channel, item.approaches, item.wins, percent(item.conversionRate)])} empty="Nenhuma abordagem registrada neste período." />
      <ReportTable title="Funil atual" headers={['Etapa', 'Leads']} rows={report.funnel.map((item) => [stageLabels[normalizeFunnelStage(item.stage)], item.leads])} empty="Nenhum lead no CRM." />
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <ReportTable title="Por membro" headers={['Membro', 'Abordagens', 'Interesses', 'Reuniões', 'Vendas', 'Receita']} rows={report.members.map((item) => [nameFor(item.memberId), item.approaches, item.interests, item.meetings, item.wins, money(item.sales)])} empty="Nenhuma atividade registrada neste período." />
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Situação dos follow-ups</h2><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg border border-white/10 p-3"><dt className="text-white/60">Pendentes</dt><dd className="mt-1 text-2xl font-semibold">{report.followUps.pending}</dd></div><div className="rounded-lg border border-white/10 p-3"><dt className="text-white/60">Concluídos</dt><dd className="mt-1 text-2xl font-semibold">{report.followUps.completed}</dd></div><div className="rounded-lg border border-white/10 p-3"><dt className="text-white/60">Cancelados</dt><dd className="mt-1 text-2xl font-semibold">{report.followUps.cancelled}</dd></div><div className="rounded-lg border border-red-300/25 bg-red-300/10 p-3"><dt className="text-white/60">Vencidos</dt><dd className="mt-1 text-2xl font-semibold">{report.followUps.overdue}</dd></div></dl></section>
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Resumo de anotações</h2><p className="mt-1 text-sm text-white/60">{report.notes.total} anotação{report.notes.total === 1 ? '' : 'ões'} registrada{report.notes.total === 1 ? '' : 's'} no período.</p><ul className="mt-5 grid gap-3">{report.notes.recent.length ? report.notes.recent.slice(0, 8).map((note, index) => <li className="rounded-lg border border-white/10 px-3 py-2 text-sm" key={`${note}-${index}`}>{note}</li>) : <li className="text-sm text-white/55">Nenhuma anotação registrada.</li>}</ul></section>
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Pontos de atenção</h2><p className="mt-1 text-sm text-white/60">Regras transparentes baseadas somente nas contagens exibidas; não são previsões.</p><ul className="mt-5 grid gap-3">{recommendations.length ? recommendations.map((recommendation) => <li className="rounded-lg border border-white/10 px-3 py-3 text-sm" key={recommendation.metric}><strong>{recommendation.message}</strong><span className="mt-1 block text-white/60">Base: {recommendation.basis}</span></li>) : <li className="text-sm text-white/55">Nenhum ponto de atenção disparado pelas regras atuais.</li>}</ul></section>
    </div>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-white/[0.09] bg-[#111411] p-5"><p className="text-sm text-white/65">{label}</p><strong className="mt-2 block text-3xl">{value}</strong><p className="mt-2 text-xs text-white/50">{detail}</p></article>;
}

function ReportTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows: (string | number)[][]; empty: string }) {
  return <section className="overflow-hidden rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/15 text-white/60"><tr>{headers.map((header) => <th className="px-2 py-3 font-medium" key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr className="border-b border-white/10 last:border-0" key={index}>{row.map((cell, cellIndex) => <td className="px-2 py-3" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-2 py-4 text-white/55" colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div></section>;
}
