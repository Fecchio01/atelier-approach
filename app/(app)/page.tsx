import Link from 'next/link';

import { MetricCard } from '@/components/metric-card';
import { PageHeading } from '@/components/ui';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMemberProfiles } from '@/lib/member-profile';
import { getDashboardMetrics, type DashboardRange, type WeeklyGoalInput } from '@/lib/metrics';
import { auxiliaryFunnelStages, mainFunnelStages, normalizeFunnelStage, stageLabels } from '@/lib/funnel';

type Period = 'day' | 'week' | 'month';
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const percent = (value: number) => `${Math.round(value * 100)}%`;

function monday(reference: Date) { const start = new Date(reference); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; }
function rangeFor(period: Period, now = new Date()): DashboardRange {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'month') start.setDate(1);
  const end = new Date(start);
  if (period === 'month') end.setMonth(end.getMonth() + 1); else end.setDate(end.getDate() + (period === 'day' ? 1 : 7));
  return { start, end, now, goalWeekStart: monday(now) };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const period: Period = params.period === 'day' || params.period === 'month' ? params.period : 'week';
  const range = rangeFor(period);
  const user = await getCurrentUser();
  const [leads, goals, profiles] = await Promise.all([
    prisma.lead.findMany({ include: { activities: { select: { actorId: true, type: true, createdAt: true, note: true }, orderBy: { createdAt: 'asc' } }, stageHistory: true, saleEvents: true, followUps: { include: { lead: { select: { id: true, name: true } } } } } }),
    prisma.goal.findMany({ where: { weekStart: range.goalWeekStart } }), getMemberProfiles()
  ]);
  const weeklyGoals: WeeklyGoalInput[] = goals.map((goal) => ({ ownerId: goal.ownerId === '__team__' ? null : goal.ownerId, weekStart: goal.weekStart, approachesTarget: goal.approachesTarget, interestsTarget: goal.interestsTarget, meetingsTarget: goal.meetingsTarget, salesTarget: goal.salesTarget, revenueTarget: goal.revenueTarget }));
  const metrics = getDashboardMetrics(leads, weeklyGoals, range);
  const mine = user ? metrics.personalResults[user.id] ?? { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 } : { approaches: 0, interests: 0, meetings: 0, sales: 0, won: 0 };
  const myProgress = user ? metrics.personalGoalProgress[user.id] : undefined;
  const names = new Map(profiles.map((profile) => [profile.id, profile.name])); if (user) names.set(user.id, user.name || user.id);
  const nameFor = (id: string) => names.get(id) ?? id;
  const teamRows = Object.entries(metrics.personalResults).sort(([first], [second]) => nameFor(first).localeCompare(nameFor(second)));
  const funnel = [...mainFunnelStages, ...auxiliaryFunnelStages].map((stage) => ({
    label: stageLabels[stage],
    leads: leads.filter((lead) => normalizeFunnelStage(lead.stage) === stage).length
  }));
  const periodLabel = period === 'day' ? 'Hoje' : period === 'week' ? 'Esta semana' : 'Este mês';
  const FollowUps = ({ followUps, empty, overdue = false }: { followUps: typeof metrics.overdue; empty: string; overdue?: boolean }) => <ul className="mt-3 grid gap-3">{followUps.length ? followUps.map((followUp) => <li key={followUp.id} className={`rounded-lg border px-3 py-2 text-sm ${overdue ? 'border-red-300/25 bg-red-300/10' : 'border-white/15'}`}><strong>{followUp.lead?.name ?? 'Lead sem nome'}</strong> · {nameFor(followUp.ownerId)} · {overdue ? `vencido em ${followUp.dueDate.toLocaleDateString('pt-BR')}` : 'retorno hoje'}</li>) : <li className="text-sm text-white/55">{empty}</li>}</ul>;
  const progressRows = (progress: typeof metrics.goalProgress) => [['Abordagens', progress.approaches], ['Interesses', progress.interests], ['Reuniões', progress.meetings], ['Vendas', progress.sales], ['Receita', progress.revenue]].map(([label, value]) => <ProgressRow key={String(label)} label={String(label)} value={value as number} />);

  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
    <PageHeading eyebrow="Atelier Approach" title="Visão operacional" description={`Indicadores registrados no CRM para ${periodLabel.toLowerCase()}.`} action={<Link href="/pesquisa" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-black">Pesquisar empresas</Link>} />
    <nav aria-label="Período do dashboard" className="mt-8 flex gap-3">{([['day', 'Hoje'], ['week', 'Semana'], ['month', 'Mês']] as const).map(([value, label]) => <Link key={value} href={`/?period=${value}`} className={`rounded-md px-4 py-2 text-sm font-semibold ${period === value ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>{label}</Link>)}</nav>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="Receita vendida" value={money(metrics.sales)} detail={`${metrics.won} negócio${metrics.won === 1 ? '' : 's'} ganho${metrics.won === 1 ? '' : 's'}`} /><MetricCard label="MRR" value={money(metrics.mrr)} detail="Receita mensal recorrente" /><MetricCard label="Abordagens" value={String(metrics.approaches)} detail="Atividades no período" /><MetricCard label="Interesses" value={String(metrics.interests)} detail="Avanços para interesse" /><MetricCard label="Reuniões / retornos" value={String(metrics.meetings)} detail="Avanços para follow-up" /><MetricCard label="Follow-ups pendentes" value={String(metrics.dueToday.length + metrics.overdue.length)} detail={`${metrics.overdue.length} vencido${metrics.overdue.length === 1 ? '' : 's'}`} /></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Metas semanais da equipe</h2><p className="mt-1 text-sm text-white/60">Alvos semanais; resultado de {periodLabel.toLowerCase()}.</p></div><Link href="/metas" className="text-sm text-[var(--atelier-green)]">Editar metas</Link></div><div className="mt-6 grid gap-5">{progressRows(metrics.goalProgress)}</div></section><section className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6"><h2 className="text-xl font-semibold">Follow-ups</h2><p className="mt-1 text-sm text-white/60">Priorize retornos vencidos e distribuídos pela equipe.</p><FollowUps followUps={metrics.overdue} empty="Nenhum follow-up vencido." overdue /><h3 className="mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-white/65">Para hoje</h3><FollowUps followUps={metrics.dueToday} empty="Nenhum retorno para hoje." /></section></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Funil atual</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{funnel.map((item) => <div className="rounded-lg border border-white/10 p-3 text-sm" key={item.label}><strong className="block text-2xl">{item.leads}</strong>{item.label}</div>)}</div></section><section className="rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Desempenho da equipe</h2><div className="mt-5 grid gap-3">{teamRows.length ? teamRows.map(([ownerId, result]) => <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-3 text-sm" key={ownerId}><span>{nameFor(ownerId)}</span><span>{result.approaches} abordagens · {result.interests} interesses · {result.meetings} reuniões · {result.won} vendas</span></div>) : <p className="text-sm text-white/55">Ainda não há atividades neste período.</p>}</div></section></div>
    <section className="mt-8 rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">Meu desempenho</h2><p className="mt-1 text-sm text-white/60">{user?.name ?? 'Membro'} · {periodLabel}</p><div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-5"><Result label="abordagens" value={mine.approaches} /><Result label="interesses" value={mine.interests} /><Result label="reuniões" value={mine.meetings} /><Result label="vendas" value={mine.won} /><Result label="vendido" value={money(mine.sales)} /></div>{myProgress ? <div className="mt-6 grid gap-3 sm:grid-cols-5">{progressRows(myProgress)}</div> : null}</section>
  </section>;
}

function ProgressRow({ label, value }: { label: string; value: number }) { return <div><div className="flex justify-between text-sm"><span>{label}</span><strong>{percent(value)}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--atelier-green)]" style={{ width: `${Math.min(value * 100, 100)}%` }} /></div></div>; }
function Result({ label, value }: { label: string; value: string | number }) { return <div><strong className="block text-2xl">{value}</strong>{label}</div>; }
