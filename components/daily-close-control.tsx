'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, CheckCircleIcon, SpinnerGapIcon } from '@phosphor-icons/react';

export function DailyCloseControl({ initiallyClosed, reportHref }: { initiallyClosed: boolean; reportHref: string }) {
  const router = useRouter();
  const [closed, setClosed] = useState(initiallyClosed);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingReopen, setConfirmingReopen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setClosed(initiallyClosed), [initiallyClosed]);

  async function closeDay() {
    if (submitting || closed) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Não foi possível fechar o dia. Tente novamente.');
      setClosed(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível fechar o dia. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function reopenDay() {
    if (submitting || !closed) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/reports', { method: 'DELETE', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || 'Não foi possível reabrir o dia. Tente novamente.');
      setClosed(false);
      setConfirmingReopen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reabrir o dia. Tente novamente.');
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
    {closed ? <div className="flex min-w-0 shrink-0 flex-col items-start gap-2 sm:items-end">
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-[var(--atelier-green)]"><CheckCircleIcon size={17} weight="fill" aria-hidden="true" />Dia fechado</span>
        <Link href={reportHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white transition-colors hover:border-[var(--atelier-green)] hover:text-[var(--atelier-green)]">Abrir relatório de hoje<ArrowRightIcon size={14} aria-hidden="true" /></Link>
        <button type="button" onClick={() => { setError(''); setConfirmingReopen(true); }} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/70 transition-colors hover:border-amber-300/60 hover:text-amber-200">Reabrir dia</button>
      </div>
      {confirmingReopen ? <div role="group" aria-label="Confirmar reabertura do dia" className="w-full max-w-md rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-3 sm:text-right">
        <p className="text-xs leading-5 text-amber-100/80">O relatório e o PDF de hoje serão removidos. As atividades do CRM continuarão salvas.</p>
        <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
          <button type="button" onClick={() => setConfirmingReopen(false)} disabled={submitting} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/75 hover:text-white disabled:opacity-60">Manter fechado</button>
          <button type="button" onClick={reopenDay} disabled={submitting} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-xs font-semibold text-[#17140b] disabled:cursor-wait disabled:opacity-70">
            {submitting ? <><SpinnerGapIcon size={14} className="animate-spin" aria-hidden="true" />Reabrindo...</> : 'Confirmar reabertura'}
          </button>
        </div>
      </div> : null}
    </div> : <button type="button" onClick={closeDay} disabled={submitting} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-[#101411] transition-colors hover:bg-[#c9ff81] disabled:cursor-wait disabled:opacity-70">
      {submitting ? <><SpinnerGapIcon size={16} className="animate-spin" aria-hidden="true" />Fechando...</> : 'Fechar o dia'}
    </button>}
  </section>;
}
