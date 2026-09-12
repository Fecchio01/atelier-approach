import Link from 'next/link';

import { buildRecommendations, buildReport, getRecentReportRange } from '@/lib/reports';
import { getMemberProfiles } from '@/lib/member-profile';

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: requestedPeriod } = await searchParams;
  const period: Period = requestedPeriod === 'month' ? 'month' : 'week';
  const [report, profiles] = await Promise.all([buildReport(getRecentReportRange(period)), getMemberProfiles()]);
  const recommendations = buildRecommendations(report);
  const nameFor = (memberId: string) => profiles.find((profile) => profile.id === memberId)?.name ?? memberId;

  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Relatórios comerciais</p><h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Leituras do CRM, sem previsões.</h1><p className="mt-2 text-white/65">Os números usam atividades, etapas e eventos de ganho registrados no CRM.</p></div>
      <Link href="/" className="text-sm text-[var(--atelier-green)]">← Dashboard</Link>
    </div>
    <nav aria-label="Período do relatório" className="mt-8 flex gap-3">
      <Link href="/relatorios?period=week" className={`rounded-md px-4 py-2 text-sm font-semibold ${period === 'week' ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>Últimos 7 dias</Link>
      <Link href="/relatorios?period=month" className={`rounded-md px-4 py-2 text-sm font-semibold ${period === 'month' ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20'}`}>Últimos 30 dias</Link>
    </nav>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric label="Abordagens" value={String(report.conversion.approaches)} detail="Atividades no período" />
      <Metric label="Ganhos" value={String(report.conversion.wins)} detail="Eventos WON no período" />
      <Metric label="Conversão" value={percent(report.conversion.rate)} detail="Ganhos ÷ abordagens" />
      <Metric label="Receita vendida" value={money(report.revenue.sales)} detail="Valores de eventos WON no período" />
      <Metric label="MRR" value={money(report.revenue.mrr)} detail="MRR de eventos WON no período" />
      <Metric label="Follow-ups pendentes" value={String(report.followUps.pending)} detail={`${report.followUps.overdue} vencido${report.followUps.overdue === 1 ? '' : 's'} · ${report.followUps.completed} concluído${report.followUps.completed === 1 ? '' : 's'}`} />
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <ReportTable title="Por canal" headers={['Canal', 'Abordagens', 'Ganhos', 'Conversão']} rows={report.channels.map((item) => [item.channel, item.approaches, item.wins, percent(item.conversionRate)])} empty="Nenhuma abordagem registrada neste período." />
      <ReportTable title="Funil atual" headers={['Etapa', 'Leads']} rows={report.funnel.map((item) => [item.stage, item.leads])} empty="Nenhum lead no CRM." />
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
  return <article className="rounded-2xl border border-white/15 bg-white/5 p-5"><p className="text-sm text-white/65">{label}</p><strong className="mt-2 block text-3xl">{value}</strong><p className="mt-2 text-xs text-white/50">{detail}</p></article>;
}

function ReportTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows: (string | number)[][]; empty: string }) {
  return <section className="overflow-hidden rounded-2xl border border-white/15 bg-black/25 p-6"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-white/15 text-white/60"><tr>{headers.map((header) => <th className="px-2 py-3 font-medium" key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr className="border-b border-white/10 last:border-0" key={index}>{row.map((cell, cellIndex) => <td className="px-2 py-3" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-2 py-4 text-white/55" colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div></section>;
}
