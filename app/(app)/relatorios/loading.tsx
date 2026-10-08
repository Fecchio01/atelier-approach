import { ReportPeriodNavigation } from '@/components/report-period-navigation';

function localDateParam(value: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-white/[0.06] ${className}`} />;
}

export default function ReportsLoading() {
  return <section aria-busy="true" aria-label="Carregando relatórios" className="mx-auto max-w-7xl px-4 py-8 sm:px-5 md:px-8 md:py-10">
    <header className="border-b border-white/[0.08] pb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">Relatórios comerciais</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">Relatórios da equipe</h1>
      <p role="status" className="sr-only">Carregando os dados do relatório.</p>
    </header>

    <ReportPeriodNavigation activePeriod={null} date={localDateParam(new Date())} />

    <div className="mt-6 rounded-xl border border-white/[0.09] bg-[#111719] p-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-3 w-64 max-w-full" />
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-8 w-32" />
        <Skeleton className="mt-3 h-3 w-40 max-w-full" />
      </div>)}
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 2 }, (_, index) => <div key={index} className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-5">
        <Skeleton className="h-5 w-44 max-w-full" />
        <Skeleton className="mt-5 h-40 w-full" />
      </div>)}
    </div>
  </section>;
}
