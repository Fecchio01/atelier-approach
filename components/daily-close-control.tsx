'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, CheckCircleIcon, SpinnerGapIcon } from '@phosphor-icons/react';

export function DailyCloseControl({ initiallyClosed, reportHref }: { initiallyClosed: boolean; reportHref: string }) {
  const router = useRouter();
  const [closedLocally, setClosedLocally] = useState(false);
  const closed = initiallyClosed || closedLocally;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function closeDay() {
    if (submitting || closed) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Não foi possível fechar o dia. Tente novamente.');
      setClosedLocally(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível fechar o dia. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return <section aria-label="Fechamento diário" className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/[0.09] bg-[#111719] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-4">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-white">Fechamento da equipe</p>
      <p className="mt-1 text-xs leading-5 text-white/50">Salva um retrato das atividades registradas hoje.</p>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
    {closed ? <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-2 font-medium text-[var(--atelier-green)]"><CheckCircleIcon size={17} weight="fill" aria-hidden="true" />Dia fechado</span>
      <Link href={reportHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white transition-colors hover:border-[var(--atelier-green)] hover:text-[var(--atelier-green)]">Abrir relatório de hoje<ArrowRightIcon size={14} aria-hidden="true" /></Link>
    </div> : <button type="button" onClick={closeDay} disabled={submitting} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-[#101411] transition-colors hover:bg-[#c9ff81] disabled:cursor-wait disabled:opacity-70">
      {submitting ? <><SpinnerGapIcon size={16} className="animate-spin" aria-hidden="true" />Fechando...</> : 'Fechar o dia'}
    </button>}
  </section>;
}
