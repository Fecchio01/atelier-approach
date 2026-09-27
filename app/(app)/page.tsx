import Link from 'next/link';

import { MetricCard } from '@/components/metric-card';
import { TeamGoalProgress } from '@/components/team-goal-progress';
import { PageHeading } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMemberProfiles } from '@/lib/member-profile';
import { getDashboardMetrics, getTeamGoalProgress, getTeamGoalTargets, type DashboardRange, type MetricFollowUp, type MetricLead } from '@/lib/metrics';
import { getGoalPeriodWindow, getLocalDayWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { auxiliaryFunnelStages, mainFunnelStages, normalizeFunnelStage, stageLabels } from '@/lib/funnel';

type Period = 'day' | 'week' | 'month';
const teamOwnerId = '__team__';
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const shortDate = (value: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(value);

function rangeFor(period: Period, now: Date, monthlyStartDay: number): DashboardRange {
  if (period === 'day') return { ...getLocalDayWindow(now), now };
  const window = getGoalPeriodWindow(period === 'week' ? 'WEEKLY' : 'MONTHLY', now, monthlyStartDay);
  return { start: window.start, end: window.end, now };
}

function windowLabel(window: GoalPeriodWindow) {
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date.format(window.start)} a ${date.format(new Date(window.end.getTime() - 1))}`;
}

function FollowUps({ followUps, empty, nameFor, overdue = false }: {
  followUps: MetricFollowUp[];
  empty: string;
  nameFor: (id: string) => string;
  overdue?: boolean;
}) {
  return <ul className="mt-3 grid gap-3">
    {followUps.length ? followUps.map((followUp) => <li key={followUp.id} className={`rounded-lg border px-3 py-2 text-sm ${overdue ? 'border-red-300/25 bg-red-300/10' : 'border-white/15'}`}>
      <strong>{followUp.lead?.name ?? 'Lead sem nome'}</strong> · {nameFor(followUp.ownerId)} · {overdue ? `vencido em ${shortDate(followUp.dueDate)}` : 'retorno hoje'}
    </li>) : <li className="text-sm text-white/55">{empty}</li>}
  </ul>;
}

function Result({ label, value }: { label: string; value: string | number }) {
  return <div><strong className="block text-2xl">{value}</strong>{label}</div>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period: Period = params.period === 'day' || params.period === 'month' ? params.period : 'week';
  const now = new Date();
  const currentWeek = getGoalPeriodWindow('WEEKLY', now, 1);
  const [user, settings, profiles, goals] = await Promise.all([
    getCurrentUser(),
    prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }),
    getMemberProfiles(),
    prisma.goal.findMany({
      where: {
        ownerId: teamOwnerId,
        OR: [
          { periodKind: 'WEEKLY', periodStart: currentWeek.start },
          { periodKind: 'MONTHLY', periodStart: { lte: now }, periodEnd: { gt: now } }
        ]
      },
      select: {
        periodKind: true, periodStart: true, periodEnd: true,
        approachesTarget: true, interestsTarget: true, meetingsTarget: true,
        salesTarget: true, revenueTarget: true, mrrTarget: true,
        followUpsCompletedTarget: true, conversionRateTarget: true
      },
      orderBy: { periodStart: 'desc' }
    })
  ]);

  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const weeklyPeriod = getGoalPeriodWindow('WEEKLY', now, monthlyStartDay);
  const weeklyGoal = goals.find((goal) => goal.periodKind === 'WEEKLY' && goal.periodStart.getTime() === weeklyPeriod.start.getTime());
  const monthlyGoal = goals.find((goal) => goal.periodKind === 'MONTHLY' && goal.periodStart <= now && goal.periodEnd > now);
  const monthlyPeriod: GoalPeriodWindow = monthlyGoal
    ? { kind: 'MONTHLY', start: monthlyGoal.periodStart, end: monthlyGoal.periodEnd }
    : getGoalPeriodWindow('MONTHLY', now, monthlyStartDay);
  const selectedRange = rangeFor(period, now, monthlyStartDay);
  const dataFrom = [selectedRange.start, weeklyPeriod.start, monthlyPeriod.start].reduce((earliest, date) => date < earliest ? date : earliest);
  const dataTo = [selectedRange.end, weeklyPeriod.end, monthlyPeriod.end].reduce((latest, date) => date > latest ? date : latest);
  const today = getLocalDayWindow(now);

  const [leads, activities, stageHistory, saleEvents, followUps] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, stage: true, saleValue: true, mrr: true, wonAt: true, wonById: true } }),
    prisma.activity.findMany({ where: { createdAt: { gte: dataFrom, lt: dataTo } }, select: { leadId: true, actorId: true, type: true, createdAt: true, note: true }, orderBy: { createdAt: 'asc' } }),
    prisma.stageHistory.findMany({ where: { createdAt: { gte: dataFrom, lt: dataTo } }, select: { leadId: true, actorId: true, toStage: true, createdAt: true } }),
    prisma.saleEvent.findMany({ where: { occurredAt: { gte: dataFrom, lt: dataTo } }, select: { leadId: true, actorId: true, saleValue: true, mrr: true, occurredAt: true } }),
    prisma.followUp.findMany({
      where: { OR: [
        { state: 'PENDING', dueDate: { lt: today.end } },
        { state: 'COMPLETED', completedAt: { gte: dataFrom, lt: dataTo } }
      ] },
      select: { id: true, leadId: true, dueDate: true, completedAt: true, ownerId: true, state: true, lead: { select: { id: true, name: true } } }
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
    activities: (activitiesByLead.get(lead.id) ?? []).map(({ actorId, type, createdAt, note }) => ({ actorId, type, createdAt, note })),
    stageHistory: historyByLead.get(lead.id) ?? [],
    saleEvents: salesByLead.get(lead.id) ?? [],
    followUps: (followUpsByLead.get(lead.id) ?? []).map(({ id, dueDate, completedAt, ownerId, state, lead: followUpLead }) => ({ id, dueDate, completedAt, ownerId, state, lead: followUpLead }))
  }));

  const selectedMetrics = getDashboardMetrics(metricLeads, selectedRange);
  const weeklyMetrics = getDashboardMetrics(metricLeads, { start: weeklyPeriod.start, end: weeklyPeriod.end, now });
  const monthlyMetrics = getDashboardMetrics(metricLeads, { start: monthlyPeriod.start, end: monthlyPeriod.end, now });
  const weeklyProgress = getTeamGoalProgress(weeklyMetrics.goalActuals, getTeamGoalTargets(weeklyGoal));
  const monthlyProgress = getTeamGoalProgress(monthlyMetrics.goalActuals, getTeamGoalTargets(monthlyGoal));
  const mine = user ? selectedMetrics.personalResults[user.id] ?? { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 } : { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 };
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]));
  if (user) names.set(user.id, user.name || user.id);
  const nameFor = (id: string) => names.get(id) ?? id;
  const teamRows = Object.entries(selectedMetrics.personalResults).sort(([first], [second]) => nameFor(first).localeCompare(nameFor(second)));
  const funnel = [...mainFunnelStages, ...auxiliaryFunnelStages].map((stage) => ({
    label: stageLabels[stage],
    leads: metricLeads.filter((lead) => normalizeFunnelStage(lead.stage) === stage).length
  }));
  const periodLabel = period === 'day' ? 'Hoje' : period === 'week' ? 'Esta semana' : 'Este ciclo mensal';

  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
    <PageHeading eyebrow="Atelier Approach" title="Visão operacional" description={`Indicadores registrados no CRM para ${periodLabel.toLowerCase()}.`} action={<Link href="/pesquisa" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black">Pesquisar empresas</Link>} />
    <nav aria-label="Período do dashboard" className="mt-8 flex gap-3">{([['day', 'Hoje'], ['week', 'Semana'], ['month', 'Ciclo mensal']] as const).map(([value, label]) => <Link key={value} href={`/?period=${value}`} className={`rounded-md px-4 py-2 text-sm font-semibold ${period === value ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>{label}</Link>)}</nav>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Receita vendida" value={money(selectedMetrics.sales)} detail={`${selectedMetrics.won} negócio${selectedMetrics.won === 1 ? '' : 's'} ganho${selectedMetrics.won === 1 ? '' : 's'}`} />
      <MetricCard label="MRR" value={money(selectedMetrics.mrr)} detail="Receita mensal recorrente" />
      <MetricCard label="Abordagens" value={String(selectedMetrics.approaches)} detail="Atividades no período" />
      <MetricCard label="Interesses" value={String(selectedMetrics.interests)} detail="Avanços para interesse" />
      <MetricCard label="Reuniões / retornos" value={String(selectedMetrics.meetings)} detail="Avanços para follow-up" />
      <MetricCard label="Follow-ups concluídos" value={String(selectedMetrics.goalActuals.followUpsCompleted)} detail="Contados pela data de conclusão" />
    </div>

    <div className="mt-8 grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Meta semanal da equipe</h2><p className="mt-1 text-sm text-white/60">{windowLabel(weeklyPeriod)}</p></div><Link href="/metas" className="text-sm text-[var(--atelier-green)]">Editar metas</Link></div>
        <div className="mt-5"><TeamGoalProgress progress={weeklyProgress} hasApproaches={weeklyMetrics.approaches > 0} compact /></div>
      </section>
      <section className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Meta do ciclo mensal</h2><p className="mt-1 text-sm text-white/60">{windowLabel(monthlyPeriod)} · começa no dia {monthlyStartDay}</p></div><Link href="/metas" className="text-sm text-[var(--atelier-green)]">Editar metas</Link></div>
        <div className="mt-5"><TeamGoalProgress progress={monthlyProgress} hasApproaches={monthlyMetrics.approaches > 0} compact /></div>
      </section>
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6"><h2 className="text-xl font-semibold">Follow-ups</h2><p className="mt-1 text-sm text-white/60">Priorize retornos vencidos e distribuídos pela equipe.</p><FollowUps followUps={selectedMetrics.overdue} empty="Nenhum follow-up vencido." nameFor={nameFor} overdue /><h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Para hoje</h3><FollowUps followUps={selectedMetrics.dueToday} empty="Nenhum retorno para hoje." nameFor={nameFor} /></section>
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Funil atual</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{funnel.map((item) => <div className="rounded-lg border border-white/10 p-3 text-sm" key={item.label}><strong className="block text-2xl">{item.leads}</strong>{item.label}</div>)}</div></section>
    </div>

    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Desempenho da equipe · {periodLabel}</h2><div className="mt-5 grid gap-3">{teamRows.length ? teamRows.map(([ownerId, result]) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-3 text-sm" key={ownerId}><span>{nameFor(ownerId)}</span><span>{result.approaches} abordagens · {result.interests} interesses · {result.meetings} reuniões · {result.won} vendas</span></div>) : <p className="text-sm text-white/55">Ainda não há atividades neste período.</p>}</div></section>
      <section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Meu desempenho</h2><p className="mt-1 text-sm text-white/60">{user?.name ?? 'Membro'} · {periodLabel}</p><div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-5"><Result label="abordagens" value={mine.approaches} /><Result label="interesses" value={mine.interests} /><Result label="reuniões" value={mine.meetings} /><Result label="vendas" value={mine.won} /><Result label="vendido" value={money(mine.sales)} /></div></section>
    </div>
  </section>;
}
