import { DashboardLifecycleWarningList } from '@/components/dashboard-lifecycle-warning-list';

import type { DashboardLifecycleWarning } from '@/lib/dashboard-lifecycle-warnings';

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
    <DashboardLifecycleWarningList warnings={warnings} />
  </section>;
}
