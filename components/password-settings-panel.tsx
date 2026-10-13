'use client';

import { useState, type ReactNode } from 'react';

export function PasswordSettingsPanel({ children, error, initiallyExpanded = false }: { children: ReactNode; error?: string; initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return <section data-atelier-material className="rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-5 md:p-7" aria-labelledby="password-title">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 id="password-title" className="text-xl font-semibold tracking-[-0.03em]">Segurança da conta</h2>
        <p className="mt-1 text-sm text-white/50">A senha atual será solicitada antes de salvar uma nova.</p>
      </div>
      <button type="button" aria-expanded={expanded} aria-controls="password-change-form" onClick={() => setExpanded((open) => !open)} className="min-h-10 rounded-lg border border-white/15 px-4 text-sm font-semibold transition-colors hover:border-[var(--atelier-green)]/60 hover:text-[var(--atelier-green)]">
        {expanded ? 'Cancelar' : 'Alterar senha'}
      </button>
    </div>
    {error ? <p role="alert" className="mt-5 rounded-lg bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
    <div id="password-change-form" hidden={!expanded} className="mt-6">
      {children}
    </div>
  </section>;
}
