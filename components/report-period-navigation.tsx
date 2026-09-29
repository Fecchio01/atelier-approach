'use client';

import Link, { useLinkStatus } from 'next/link';
import { SpinnerGapIcon } from '@phosphor-icons/react';

type ReportPeriod = 'day' | 'week' | 'month';

function PendingIndicator({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return <span role="status" className="ml-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--atelier-green)]">
    <SpinnerGapIcon className="animate-spin" size={14} aria-hidden="true" />
    Carregando {label.toLocaleLowerCase('pt-BR')}…
  </span>;
}

export function ReportPeriodNavigation({ activePeriod, date }: { activePeriod: ReportPeriod | null; date: string }) {
  const links: { period: ReportPeriod; label: string; href: string }[] = [
    { period: 'day', label: 'Diário', href: `/relatorios?period=day&date=${date}` },
    { period: 'week', label: 'Esta semana', href: '/relatorios?period=week' },
    { period: 'month', label: 'Ciclo atual', href: '/relatorios?period=month' }
  ];

  return <nav aria-label="Período do relatório" className="mt-6 flex flex-wrap gap-2">
    {links.map((link) => {
      const active = activePeriod === link.period;
      return <Link key={link.period} href={link.href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-md px-4 py-2 text-sm font-semibold ${active ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20 text-white/70 hover:text-white'}`}>
        {link.label}
        <PendingIndicator label={link.label} />
      </Link>;
    })}
  </nav>;
}
