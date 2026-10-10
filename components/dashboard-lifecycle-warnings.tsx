import Link from 'next/link';

import type { DashboardLifecycleWarning } from '@/lib/dashboard-lifecycle-warnings';

function shortDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(value);
}

export function DashboardLifecycleWarnings({ warnings }: { warnings: DashboardLifecycleWarning[] }) {
  if (warnings.length === 0) return null;

  return <section aria-labelledby="lifecycle-warning-title" className="rounded-xl border border-amber-200/15 bg-[var(--atelier-surface)] p-4 md:p-5">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-300/[0.08] text-sm font-semibold text-amber-200">!</span>
      <div className="min-w-0">
        <h2 id="lifecycle-warning-title" className="text-base font-semibold tracking-tight">Atenção aos próximos descartes</h2>
        <p className="mt-1 text-xs text-white/50">Este aviso é informativo. Leads sem avanço são movidos automaticamente para a lixeira ao fim do prazo.</p>
      </div>
    </div>
    {warnings.length ? <ul className="mt-3 divide-y divide-white/[0.07]">
      {warnings.map((warning) => <li key={warning.leadId}>
        <Link href={`/crm?lead=${encodeURIComponent(warning.leadId)}`} className="group flex min-h-16 items-center justify-between gap-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-white group-hover:text-[var(--atelier-green)]">{warning.leadName}</strong>
            <span className="mt-1 block truncate text-xs text-white/55">{warning.currentStage} · origem: {warning.originStage ?? 'não registrada'}</span>
            <span className="mt-1 block text-xs text-white/45">Prazo: {shortDate(warning.discardAt)}</span>
          </span>
          <span className="shrink-0 text-right text-xs font-medium text-amber-200">{warning.remainingTime}</span>
        </Link>
      </li>)}
    </ul> : <p className="mt-3 border-t border-white/[0.07] pt-3 text-sm text-white/50">Nenhum lead próximo do descarte automático.</p>}
  </section>;
}
