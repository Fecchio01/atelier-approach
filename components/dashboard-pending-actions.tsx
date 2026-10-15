import Link from 'next/link';
import type { DashboardPendingAction } from '@/lib/dashboard-pending-actions';

function tone(kind: DashboardPendingAction['kind']) {
  if (kind === 'MEETING_OVERDUE') return 'border-rose-300/15 bg-rose-300/[0.04] text-rose-200';
  if (kind === 'MEETING_SOON') return 'border-sky-300/15 bg-sky-300/[0.04] text-sky-200';
  return 'border-white/[0.08] bg-white/[0.02] text-[var(--atelier-green)]';
}

export function DashboardPendingActions({ actions }: { actions: DashboardPendingAction[] }) {
  if (actions.length === 0) return null;

  return <section aria-labelledby="dashboard-pending-actions-title" className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-[var(--atelier-surface)] p-4 md:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-sm font-semibold text-[var(--atelier-green)]">!</span>
        <div>
          <h2 id="dashboard-pending-actions-title" className="text-base font-semibold tracking-tight">Ações pendentes</h2>
          <p className="mt-1 text-xs text-white/50">Próximos passos para manter as oportunidades avançando.</p>
        </div>
      </div>
      <span className="rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-xs tabular-nums text-white/60">{actions.length}</span>
    </div>
    <ul className="mt-3 divide-y divide-white/[0.07]">
      {actions.map((action) => <li key={`${action.leadId}:${action.kind}`}>
        <Link href={`/crm?lead=${encodeURIComponent(action.leadId)}`} className="group flex min-h-16 items-center justify-between gap-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]">
          <span className="min-w-0">
            <strong className="block truncate text-sm font-medium text-white group-hover:text-[var(--atelier-green)]">{action.leadName}</strong>
            <span className="mt-1 block truncate text-xs text-white/55">{action.stage} · {action.title}</span>
            <span className="mt-1 block text-xs text-white/45">{action.detail}</span>
          </span>
          <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium ${tone(action.kind)}`}>Abrir</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}
