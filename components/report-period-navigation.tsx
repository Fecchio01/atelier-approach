'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useReportPeriodNavigationState, type ReportPeriod } from './report-period-navigation-state';

const periodLabels: Record<ReportPeriod, string> = {
  day: 'diário',
  week: 'semanal',
  month: 'ciclo atual'
};

export function ReportPeriodNavigation({ activePeriod, date }: { activePeriod: ReportPeriod | null; date: string }) {
  const { pendingPeriod, beginNavigation, clearPendingNavigation } = useReportPeriodNavigationState();
  const links: { period: ReportPeriod; label: string; href: string }[] = [
    { period: 'day', label: 'Diário', href: `/relatorios?period=day&date=${date}` },
    { period: 'week', label: 'Esta semana', href: '/relatorios?period=week' },
    { period: 'month', label: 'Ciclo atual', href: '/relatorios?period=month' }
  ];

  useEffect(() => {
    if (activePeriod && pendingPeriod === activePeriod) clearPendingNavigation(activePeriod);
  }, [activePeriod, pendingPeriod, clearPendingNavigation]);

  return <nav aria-label="Período do relatório" aria-busy={Boolean(pendingPeriod)} className="mt-6 flex flex-wrap gap-2 rounded-xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-1.5">
    {links.map((link) => {
      const active = activePeriod === link.period;
      const locked = pendingPeriod !== null;
      return <Link key={link.period} href={link.href} aria-current={active ? 'page' : undefined} aria-disabled={locked ? true : undefined} tabIndex={locked ? -1 : undefined} onNavigate={(event) => {
        if (active || !beginNavigation(link.period)) event.preventDefault();
      }} className={`inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-semibold transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] ${locked ? 'pointer-events-none opacity-60' : ''} ${active ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20 text-white/70 hover:text-white'}`}>
        {link.label}
      </Link>;
    })}
    {pendingPeriod ? <p role="status" className="basis-full pt-1 text-sm text-white/60">Abrindo relatório {periodLabels[pendingPeriod]}…</p> : null}
  </nav>;
}
