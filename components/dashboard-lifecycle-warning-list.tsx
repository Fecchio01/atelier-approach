'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { DashboardLifecycleWarning } from '@/lib/dashboard-lifecycle-warnings';

function shortDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function WarningItem({ warning }: { warning: DashboardLifecycleWarning }) {
  return <li>
    <Link href={`/crm?lead=${encodeURIComponent(warning.leadId)}`} className="group flex min-h-16 items-center justify-between gap-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]">
      <span className="min-w-0">
        <strong className="block truncate text-sm font-medium text-white group-hover:text-[var(--atelier-green)]">{warning.leadName}</strong>
        <span className="mt-1 block truncate text-xs text-white/55">{warning.currentStage} · origem: {warning.originStage ?? 'não registrada'}</span>
        <span className="mt-1 block text-xs text-white/45">Prazo: {shortDate(warning.discardAt)}</span>
      </span>
      <span className="shrink-0 text-right text-xs font-medium text-amber-200">{warning.remainingTime}</span>
    </Link>
  </li>;
}

export function DashboardLifecycleWarningList({ warnings }: { warnings: DashboardLifecycleWarning[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [firstWarning, ...remainingWarnings] = warnings;
  if (!firstWarning) return null;

  return <>
    <ul id="lifecycle-warning-additional-leads" className="mt-3 divide-y divide-white/[0.07]">
      <WarningItem warning={firstWarning} />
      {isExpanded && remainingWarnings.map((warning) => <WarningItem key={warning.leadId} warning={warning} />)}
    </ul>
    {remainingWarnings.length > 0 && <button
      type="button"
      aria-expanded={isExpanded}
      aria-controls="lifecycle-warning-additional-leads"
      onClick={() => setIsExpanded((expanded) => !expanded)}
      className="mt-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-amber-200/90 outline-none transition-colors hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]"
    >
      {isExpanded ? 'Ver menos' : 'Ver mais'}
    </button>}
  </>;
}
