'use client';

import { useEffect } from 'react';
import { useReportPeriodNavigationState } from '@/components/report-period-navigation-state';

export default function ReportsError({ reset }: { reset: () => void }) {
  const { clearPendingNavigation } = useReportPeriodNavigationState();

  useEffect(() => {
    clearPendingNavigation();
  }, [clearPendingNavigation]);

  return <section role="alert" className="mx-auto max-w-3xl px-4 py-12 sm:px-5 md:px-8">
    <div className="rounded-2xl border border-red-300/20 bg-[#111411] p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-200">Relatórios indisponíveis</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">Não foi possível carregar este relatório.</h1>
      <p className="mt-2 text-sm text-white/65">A navegação foi liberada. Tente novamente em instantes.</p>
      <button type="button" onClick={reset} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[var(--atelier-green)] px-4 py-2 text-sm font-semibold text-black transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green-hover)]">Tentar novamente</button>
    </div>
  </section>;
}
