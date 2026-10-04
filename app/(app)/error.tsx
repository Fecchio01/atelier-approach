'use client';

import { useEffect } from 'react';
import { ArrowCounterClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    window.dispatchEvent(new Event('atelier:navigation-error'));
  }, []);

  return <section role="alert" className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
    <span className="flex size-12 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/[0.08] text-amber-200"><WarningCircleIcon size={22} aria-hidden="true" /></span>
    <h1 className="mt-5 text-xl font-semibold">Não foi possível carregar esta página</h1>
    <p className="mt-2 max-w-md text-sm leading-6 text-white/55">Tente novamente. Se o problema persistir, volte ao painel e abra a seção outra vez.</p>
    <button type="button" onClick={reset} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--atelier-green)] px-4 text-sm font-semibold text-[#101507] hover:bg-[var(--atelier-green-hover)]"><ArrowCounterClockwiseIcon size={17} aria-hidden="true" /> Tentar novamente</button>
  </section>;
}
