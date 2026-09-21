import type { ReactNode } from 'react';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header data-testid="page-heading" className="flex flex-col gap-5 border-b border-white/[0.08] pb-8 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-3xl"><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">{eyebrow}</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-white md:text-4xl">{title}</h1><p className="mt-3 text-sm leading-6 text-white/55 md:text-base">{description}</p></div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </header>;
}

export function Surface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/[0.09] bg-[#111411] shadow-[0_16px_50px_rgba(0,0,0,0.16)] ${className}`}>{children}</section>;
}
