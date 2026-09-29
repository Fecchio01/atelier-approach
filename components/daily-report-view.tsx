import Link from 'next/link';
import type { ActivityType, Channel } from '@prisma/client';

import { DailyCloseControl } from './daily-close-control';
import { ReportPdfDownload } from './report-pdf-download';
import type { DailyReportRecord } from '@/lib/daily-reports';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' });
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const activityLabels: Record<ActivityType, string> = {
  CONTACT: 'Abordagem registrada',
  STAGE_CHANGE: 'Etapa atualizada',
  FOLLOW_UP_SCHEDULED: 'Follow-up agendado',
  FOLLOW_UP_COMPLETED: 'Follow-up concluído',
  FOLLOW_UP_CANCELLED: 'Follow-up cancelado',
  SALE_WON: 'Negócio ganho',
  LEAD_REOPENED: 'Empresa reaberta',
  DISCARDED: 'Empresa descartada'
};
const channelLabels: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp', PHONE: 'Telefone', EMAIL: 'E-mail', INSTAGRAM: 'Instagram', IN_PERSON: 'Presencial', OTHER: 'Outro'
};

function localDateParam(value: Date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="min-w-0 rounded-xl border border-white/[0.08] bg-[#111719] p-4">
    <p className="text-xs text-white/55">{label}</p>
    <strong className="mt-2 block truncate text-2xl font-semibold tabular-nums text-white">{value}</strong>
  </article>;
}

export function DailyReportView({
  date,
  report,
  recent,
  todayReport,
  todayHref
}: {
  date: string;
  report: DailyReportRecord | null;
  recent: DailyReportRecord[];
  todayReport: boolean;
  todayHref: string;
}) {
  const selectedDate = new Date(`${date}T12:00:00.000Z`);
  const summary = report?.snapshot.summary;
  return <section className="mx-auto max-w-7xl px-4 py-8 sm:px-5 md:px-8 md:py-10">
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Relatórios comerciais</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">Relatório diário</h1>
        <p className="mt-3 text-sm leading-6 text-white/55">Retrato da equipe em {dateFormatter.format(selectedDate)}. Cada fechamento preserva os dados existentes naquele instante.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {report ? <ReportPdfDownload href={`/api/reports?format=pdf&period=day&date=${date}`} /> : null}
        <Link href="/" className="shrink-0 text-sm text-[var(--atelier-green)]">← Painel</Link>
      </div>
    </header>

    <nav aria-label="Período do relatório" className="mt-6 flex flex-wrap gap-2">
      <Link href={`/relatorios?period=day&date=${date}`} aria-current="page" className="rounded-md bg-[var(--atelier-green)] px-4 py-2 text-sm font-semibold text-black">Diário</Link>
      <Link href="/relatorios?period=week" className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white">Esta semana</Link>
      <Link href="/relatorios?period=month" className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white">Ciclo atual</Link>
    </nav>

    <div className="mt-5">
      <DailyCloseControl initiallyClosed={todayReport} reportHref={todayHref} />
    </div>

    {report ? <>
      <p className="mt-6 text-sm text-white/60">Fechado em <strong className="text-white">{timeFormatter.format(report.closedAt)}</strong></p>
      <section aria-labelledby="daily-summary-title" className="mt-5">
        <h2 id="daily-summary-title" className="mb-3 text-lg font-semibold">Resumo do dia</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <Metric label="Abordagens" value={summary!.approaches} />
          <Metric label="Interesses" value={summary!.interests} />
          <Metric label="Reuniões / retornos" value={summary!.meetings} />
          <Metric label="Vendas" value={summary!.sales} />
          <Metric label="Receita vendida" value={money(summary!.revenue)} />
          <Metric label="MRR" value={money(summary!.mrr)} />
          <Metric label="Follow-ups concluídos" value={summary!.followUpsCompleted} />
          <Metric label="Conversão" value={`${summary!.conversionRate}%`} />
        </div>
      </section>

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-white/[0.09] bg-black/25 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Atividades por canal</h2>
          <ul className="mt-3 divide-y divide-white/[0.08]">
            {summary!.channels.length ? summary!.channels.map((channel) => <li key={channel.channel} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>{channelLabels[channel.channel]}</span><span className="text-white/60">{channel.approaches} abordagem{channel.approaches === 1 ? '' : 's'} · {channel.wins} ganho{channel.wins === 1 ? '' : 's'}</span>
            </li>) : <li className="py-3 text-sm text-white/50">Nenhuma abordagem por canal registrada.</li>}
          </ul>
        </section>
        <section className="min-w-0 rounded-2xl border border-white/[0.09] bg-black/25 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Desempenho da equipe</h2>
          <ul className="mt-3 divide-y divide-white/[0.08]">
            {summary!.members.length ? summary!.members.map((member) => <li key={member.memberId} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <span className="min-w-0 truncate">{member.memberName ?? member.memberId}</span><span className="text-white/60 sm:shrink-0 sm:text-right">{member.approaches} abord. · {member.interests} interesses · {money(member.revenue)}</span>
            </li>) : <li className="py-3 text-sm text-white/50">Nenhuma atividade registrada por membro.</li>}
          </ul>
        </section>
      </div>

      <section aria-labelledby="daily-actions-title" className="mt-7 rounded-2xl border border-white/[0.09] bg-black/25 p-4 sm:p-5">
        <h2 id="daily-actions-title" className="text-lg font-semibold">Ações do dia</h2>
        <ol className="mt-3 divide-y divide-white/[0.08]">
          {report.snapshot.actions.length ? report.snapshot.actions.map((action) => <li key={action.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-5">
            <time dateTime={action.occurredAt} className="shrink-0 text-xs tabular-nums text-white/45">{timeFormatter.format(new Date(action.occurredAt))}</time>
            <div className="min-w-0 text-sm">
              <p className="break-words font-medium text-white">{activityLabels[action.type]} · {action.leadName}</p>
              <p className="mt-1 text-xs text-white/50">{[action.actorName, action.channel ? channelLabels[action.channel] : null].filter(Boolean).join(' · ') || 'Responsável não identificado'}</p>
              {action.note ? <p className="mt-2 break-words text-sm text-white/65">{action.note}</p> : null}
            </div>
          </li>) : <li className="py-4 text-sm text-white/50">Nenhuma atividade registrada antes do fechamento.</li>}
        </ol>
      </section>
    </> : <section role="status" className="mt-6 rounded-2xl border border-white/[0.09] bg-[#111719] p-5 text-sm text-white/60">
      Este dia ainda não foi fechado. Nenhum relatório diário salvo para esta data.
    </section>}

    <section aria-labelledby="recent-daily-reports-title" className="mt-7 rounded-2xl border border-white/[0.09] bg-black/25 p-4 sm:p-5">
      <h2 id="recent-daily-reports-title" className="text-lg font-semibold">Fechamentos recentes</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {recent.length ? recent.map((item) => {
          const itemDate = localDateParam(item.dayStart);
          return <li key={item.id}><Link href={`/relatorios?period=day&date=${itemDate}`} aria-current={itemDate === date ? 'page' : undefined} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-white/[0.08] px-3 py-2 text-sm transition-colors hover:border-[var(--atelier-green)]">
            <span className="font-medium">{dateFormatter.format(item.dayStart)}</span><span className="text-xs text-white/50">{item.snapshot.summary.approaches} abordagens</span>
          </Link></li>;
        }) : <li className="py-2 text-sm text-white/50">Nenhum dia fechado ainda.</li>}
      </ul>
    </section>
  </section>;
}
