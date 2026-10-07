import Link from 'next/link';
import {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  CalendarCheckIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  TargetIcon,
  UserIcon,
  UsersThreeIcon
} from '@phosphor-icons/react/dist/ssr';

import { TeamGoalProgress } from '@/components/team-goal-progress';
import { DashboardPeriodSelector } from '@/components/dashboard-period-selector';
import { DailyCloseControl } from '@/components/daily-close-control';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDailyReportForDate } from '@/lib/daily-reports';
import { getMemberProfiles } from '@/lib/member-profile';
import { getDashboardMetrics, getTeamGoalProgress, getTeamGoalTargets, type MetricFollowUp, type MetricLead } from '@/lib/metrics';
import { getDashboardDataFetchWindow, getGoalPeriodWindow, getLocalDayWindow, selectDashboardWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { auxiliaryFunnelStages, mainFunnelStages, normalizeFunnelStage, stageLabels } from '@/lib/funnel';

type Period = 'day' | 'week' | 'month';
const teamOwnerId = '__team__';
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const shortDate = (value: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(value);
function localDateParam(value: Date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function windowLabel(window: GoalPeriodWindow) {
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${date.format(window.start)} a ${date.format(new Date(window.end.getTime() - 1))}`;
}

function FollowUps({ followUps, empty, nameFor, overdue = false, upcoming = false }: {
  followUps: MetricFollowUp[];
  empty: string;
  nameFor: (id: string) => string;
  overdue?: boolean;
  upcoming?: boolean;
}) {
  return <ul className="mt-2 flex flex-1 flex-col divide-y divide-white/[0.07]">
    {followUps.length ? followUps.map((followUp) => <li key={followUp.id} className="flex items-start gap-3 py-3 text-sm">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${overdue ? 'bg-rose-300/10 text-rose-300' : 'bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]'}`}>
        {overdue ? <CalendarCheckIcon size={17} weight="regular" aria-hidden="true" /> : <CheckCircleIcon size={17} weight="regular" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate font-medium text-white">{followUp.lead?.name ?? 'Lead sem nome'}</strong>
        <span className="mt-1 block text-xs text-white/55">{nameFor(followUp.ownerId)} · {overdue ? `Vencido em ${shortDate(followUp.dueDate)}` : upcoming ? `Retorno em ${shortDate(followUp.dueDate)}` : 'Retorno previsto para hoje'}</span>
      </span>
      <ArrowRightIcon className="mt-2 shrink-0 text-white/35" size={15} aria-hidden="true" />
    </li>) : <li className="flex flex-1 items-center py-3 text-sm text-white/50">{empty}</li>}
  </ul>;
}

function Result({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0">
    <strong className="block truncate text-xl font-semibold tabular-nums tracking-tight text-white md:text-2xl">{value}</strong>
    <span className="mt-1 block text-xs leading-snug text-white/50">{label}</span>
  </div>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period: Period = params.period === 'day' || params.period === 'month' ? params.period : 'week';
  const now = new Date();
  const currentWeek = getGoalPeriodWindow('WEEKLY', now, 1);
  const today = getLocalDayWindow(now);
  const fetchWindow = getDashboardDataFetchWindow(now);
  const [user, settings, profiles, dailyReport, goals, leads, activities, stageHistory, saleEvents, followUps, upcomingFollowUps] = await Promise.all([
    getCurrentUser(),
    prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }),
    getMemberProfiles(),
    getDailyReportForDate(now),
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
    }),
    prisma.lead.findMany({ select: { id: true, stage: true, saleValue: true, mrr: true, wonAt: true, wonById: true, _count: { select: { saleEvents: true } } } }),
    prisma.activity.findMany({ where: { createdAt: { gte: fetchWindow.from, lt: fetchWindow.to } }, select: { leadId: true, actorId: true, type: true, createdAt: true, note: true }, orderBy: { createdAt: 'asc' } }),
    prisma.stageHistory.findMany({ where: { createdAt: { gte: fetchWindow.from, lt: fetchWindow.to } }, select: { leadId: true, actorId: true, toStage: true, createdAt: true } }),
    prisma.saleEvent.findMany({ where: { occurredAt: { gte: fetchWindow.from, lt: fetchWindow.to }, reversedAt: null }, select: { leadId: true, actorId: true, saleValue: true, mrr: true, occurredAt: true } }),
    prisma.followUp.findMany({
      where: { OR: [
        { state: 'PENDING', dueDate: { lt: today.end } },
        { state: 'COMPLETED', completedAt: { gte: fetchWindow.from, lt: fetchWindow.to } }
      ] },
      select: { id: true, leadId: true, dueDate: true, completedAt: true, ownerId: true, state: true, lead: { select: { id: true, name: true } } }
    }),
    prisma.followUp.findMany({
      where: { state: 'PENDING', dueDate: { gte: today.end } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      take: 5,
      select: { id: true, leadId: true, dueDate: true, completedAt: true, ownerId: true, state: true, lead: { select: { id: true, name: true } } }
    })
  ]);

  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const weeklyPeriod = getGoalPeriodWindow('WEEKLY', now, monthlyStartDay);
  const weeklyGoal = goals.find((goal) => goal.periodKind === 'WEEKLY' && goal.periodStart.getTime() === weeklyPeriod.start.getTime());
  const monthlyGoal = goals.find((goal) => goal.periodKind === 'MONTHLY' && goal.periodStart <= now && goal.periodEnd > now);
  const monthlyPeriod: GoalPeriodWindow = monthlyGoal
    ? { kind: 'MONTHLY', start: monthlyGoal.periodStart, end: monthlyGoal.periodEnd }
    : getGoalPeriodWindow('MONTHLY', now, monthlyStartDay);
  const selectedRange = { ...selectDashboardWindow(period, now, weeklyPeriod, monthlyPeriod), now };
  const dataFrom = [selectedRange.start, weeklyPeriod.start, monthlyPeriod.start].reduce((earliest, date) => date < earliest ? date : earliest);
  const dataTo = [selectedRange.end, weeklyPeriod.end, monthlyPeriod.end].reduce((latest, date) => date > latest ? date : latest);
  const activitiesInPeriods = activities.filter(({ createdAt }) => createdAt >= dataFrom && createdAt < dataTo);
  const stageHistoryInPeriods = stageHistory.filter(({ createdAt }) => createdAt >= dataFrom && createdAt < dataTo);
  const saleEventsInPeriods = saleEvents.filter(({ occurredAt }) => occurredAt >= dataFrom && occurredAt < dataTo);
  const completedFollowUpsInPeriods = followUps.filter((followUp) => followUp.state !== 'COMPLETED' || Boolean(followUp.completedAt && followUp.completedAt >= dataFrom && followUp.completedAt < dataTo));

  const byLead = <T extends { leadId: string }>(rows: T[]) => {
    const result = new Map<string, T[]>();
    for (const row of rows) result.set(row.leadId, [...(result.get(row.leadId) ?? []), row]);
    return result;
  };
  const activitiesByLead = byLead(activitiesInPeriods);
  const historyByLead = byLead(stageHistoryInPeriods);
  const salesByLead = byLead(saleEventsInPeriods);
  const followUpsByLead = byLead([...completedFollowUpsInPeriods, ...upcomingFollowUps]);
  const metricLeads: MetricLead[] = leads.map((lead) => ({
    ...lead,
    hasSaleHistory: lead._count?.saleEvents > 0,
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
  const maxFunnelLeads = Math.max(1, ...funnel.map((item) => item.leads));
  const periodLabel = period === 'day' ? 'Hoje' : period === 'week' ? 'Esta semana' : 'Este ciclo mensal';
  const dailyDate = localDateParam(now);
  const dashboardMetrics = [
    { label: 'Receita vendida', value: money(selectedMetrics.sales), detail: `${selectedMetrics.won} negócio${selectedMetrics.won === 1 ? '' : 's'} ganho${selectedMetrics.won === 1 ? '' : 's'}`, Icon: CurrencyDollarIcon },
    { label: 'MRR', value: money(selectedMetrics.mrr), detail: 'Receita mensal recorrente', Icon: ChartBarIcon },
    { label: 'Abordagens', value: String(selectedMetrics.approaches), detail: 'Atividades no período', Icon: PaperPlaneTiltIcon },
    { label: 'Interesses', value: String(selectedMetrics.interests), detail: 'Avanços para interesse', Icon: UsersThreeIcon },
    { label: 'Reuniões', value: String(selectedMetrics.meetings), detail: 'Avanços para reunião', Icon: CalendarCheckIcon },
    { label: 'Follow-ups concluídos', value: String(selectedMetrics.goalActuals.followUpsCompleted), detail: 'Contados pela data de conclusão', Icon: CheckCircleIcon }
  ];

  return <section className="mx-auto max-w-[1480px] px-5 py-8 md:px-8 md:py-10 xl:px-10">
    <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Arvello</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-white md:text-[2.1rem]">Visão operacional</h1>
        <p className="mt-2 max-w-[60ch] text-sm text-white/55">Indicadores registrados no CRM para {periodLabel.toLowerCase()}.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <DashboardPeriodSelector period={period} />
        <Link href="/pesquisa" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-[#101411] transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:-translate-y-px active:translate-y-px">
          <MagnifyingGlassIcon size={17} weight="bold" aria-hidden="true" />Pesquisar empresas
        </Link>
      </div>
    </header>

    <div className="mt-5">
      <DailyCloseControl initiallyClosed={Boolean(dailyReport)} reportHref={`/relatorios?period=day&date=${dailyDate}`} />
    </div>

    <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {dashboardMetrics.map(({ label, value, detail, Icon }) => <article className="flex min-h-[112px] items-start gap-3.5 rounded-xl border border-white/[0.08] bg-[#111719] p-4 transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:-translate-y-px hover:border-white/[0.14] md:p-5" key={label}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.035] text-[var(--atelier-green)]">
          <Icon size={20} weight="regular" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-white/55">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
          <p className="mt-1 truncate text-xs text-white/40">{detail}</p>
        </div>
      </article>)}
    </div>

    <div className="mt-6 grid items-start gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><TargetIcon size={19} weight="regular" aria-hidden="true" /></span>
            <div><h2 className="text-base font-semibold tracking-tight">Meta semanal da equipe</h2><p className="mt-1 text-xs text-white/50">{windowLabel(weeklyPeriod)}</p></div>
          </div>
          <Link href="/metas" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--atelier-green)] hover:text-white">Editar metas <ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>
        </div>
        <div className="mt-4"><TeamGoalProgress progress={weeklyProgress} hasApproaches={weeklyMetrics.approaches > 0} compact /></div>
      </section>
      <section className="rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><TargetIcon size={19} weight="regular" aria-hidden="true" /></span>
            <div><h2 className="text-base font-semibold tracking-tight">Meta do ciclo mensal</h2><p className="mt-1 text-xs text-white/50">{windowLabel(monthlyPeriod)} · começa no dia {monthlyStartDay}</p></div>
          </div>
          <Link href="/metas" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--atelier-green)] hover:text-white">Editar metas <ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>
        </div>
        <div className="mt-4"><TeamGoalProgress progress={monthlyProgress} hasApproaches={monthlyMetrics.approaches > 0} compact /></div>
      </section>
    </div>

    <div className="mt-6 grid items-stretch gap-4 xl:grid-cols-2">
      <section className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><CalendarCheckIcon size={19} weight="regular" aria-hidden="true" /></span>
          <div><h2 className="text-base font-semibold tracking-tight">Follow-ups</h2><p className="mt-1 text-xs text-white/50">Retornos vencidos, de hoje e os cinco próximos.</p></div>
        </div>
        <div className="mt-4 grid flex-1 gap-4 sm:grid-cols-3 sm:divide-x sm:divide-white/[0.08]">
          <section className="flex min-w-0 flex-col sm:pr-4" aria-labelledby="overdue-followups-heading">
            <h3 id="overdue-followups-heading" className="flex items-center gap-2 text-xs font-semibold text-white/70"><span className="size-1.5 rounded-full bg-rose-300" />Em atraso <span className="tabular-nums text-white/40">{selectedMetrics.overdue.length}</span></h3>
            <FollowUps followUps={selectedMetrics.overdue} empty="Nenhum follow-up vencido." nameFor={nameFor} overdue />
          </section>
          <section className="flex min-w-0 flex-col sm:px-4" aria-labelledby="today-followups-heading">
            <h3 id="today-followups-heading" className="flex items-center gap-2 text-xs font-semibold text-white/70"><span className="size-1.5 rounded-full bg-[var(--atelier-green)]" />Para hoje <span className="tabular-nums text-white/40">{selectedMetrics.dueToday.length}</span></h3>
            <FollowUps followUps={selectedMetrics.dueToday} empty="Nenhum retorno para hoje." nameFor={nameFor} />
          </section>
          <section className="flex min-w-0 flex-col sm:pl-4" aria-labelledby="upcoming-followups-heading">
            <h3 id="upcoming-followups-heading" className="flex items-center gap-2 text-xs font-semibold text-white/70"><span className="size-1.5 rounded-full bg-sky-300" />Próximos <span className="tabular-nums text-white/40">{selectedMetrics.upcoming.length}</span></h3>
            <FollowUps followUps={selectedMetrics.upcoming} empty="Nenhum retorno futuro pendente." nameFor={nameFor} upcoming />
          </section>
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><FunnelIcon size={19} weight="regular" aria-hidden="true" /></span>
          <div><h2 className="text-base font-semibold tracking-tight">Funil atual</h2><p className="mt-1 text-xs text-white/50">Empresas em cada etapa do funil.</p></div>
        </div>
        <ul className="mt-4 divide-y divide-white/[0.07]">
          {funnel.map((item) => <li key={item.label} className="grid grid-cols-[minmax(100px,1fr)_minmax(70px,1.3fr)_2.5rem] items-center gap-3 py-2 text-xs sm:grid-cols-[minmax(120px,1fr)_minmax(90px,1.5fr)_3rem]">
            <span className="truncate text-white/75">{item.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label={`Leads em ${item.label}`} aria-valuemin={0} aria-valuemax={maxFunnelLeads} aria-valuenow={item.leads}>
              <span className="block h-full rounded-full bg-[var(--atelier-green)]" style={{ width: `${(item.leads / maxFunnelLeads) * 100}%` }} />
            </span>
            <strong className="text-right font-semibold tabular-nums text-white">{item.leads}</strong>
          </li>)}
        </ul>
      </section>
    </div>

    <div className="mt-6 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
      <section className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><UsersThreeIcon size={19} weight="regular" aria-hidden="true" /></span>
          <div><h2 className="text-base font-semibold tracking-tight">Desempenho da equipe</h2><p className="mt-1 text-xs text-white/50">Resultados registrados · {periodLabel.toLowerCase()}</p></div>
        </div>
        <div className="mt-4 min-w-0 flex-1 overflow-x-auto">
          <table className="w-full min-w-[650px] border-collapse text-left text-xs">
            <thead><tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40"><th className="pb-3 pr-4">Membro</th><th className="px-2 pb-3 text-right">Abordagens</th><th className="px-2 pb-3 text-right">Interesses</th><th className="px-2 pb-3 text-right">Reuniões</th><th className="px-2 pb-3 text-right">Vendas</th><th className="pb-3 pl-2 text-right">Vendido</th></tr></thead>
            <tbody>
              {teamRows.length ? teamRows.map(([ownerId, result]) => <tr className="border-b border-white/[0.06] last:border-0" key={ownerId}>
                <th scope="row" className="py-3 pr-4 font-medium text-white"><span className="flex items-center gap-2.5"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-semibold text-white/70">{nameFor(ownerId).trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span><span className="max-w-40 truncate">{nameFor(ownerId)}</span></span></th>
                <td className="px-2 py-3 text-right tabular-nums text-white/70">{result.approaches}</td><td className="px-2 py-3 text-right tabular-nums text-white/70">{result.interests}</td><td className="px-2 py-3 text-right tabular-nums text-white/70">{result.meetings}</td><td className="px-2 py-3 text-right tabular-nums text-white/70">{result.won}</td><td className="py-3 pl-2 text-right tabular-nums text-white/70">{money(result.sales)}</td>
              </tr>) : <tr><td colSpan={6} className="py-5 text-white/50">Ainda não há atividades neste período.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[#111719] p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><UserIcon size={19} weight="regular" aria-hidden="true" /></span>
          <div><h2 className="text-base font-semibold tracking-tight">Meu desempenho</h2><p className="mt-1 text-xs text-white/50">{user?.name ?? 'Membro'} · {periodLabel.toLowerCase()}</p></div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 text-left">
          <Result label="Abordagens" value={mine.approaches} />
          <Result label="Interesses" value={mine.interests} />
          <Result label="Reuniões" value={mine.meetings} />
          <Result label="Vendas" value={mine.won} />
          <Result label="Receita vendida" value={money(mine.sales)} />
        </div>
      </section>
    </div>

    <footer className="mt-8 flex flex-col gap-1 border-t border-white/[0.07] pt-4 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
      <span><span className="font-medium text-white/65">Arvello</span> · CRM para prospecção de serviços automotivos</span>
    </footer>
  </section>;
}
