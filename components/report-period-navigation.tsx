'use client';

type ReportPeriod = 'day' | 'week' | 'month';

export function ReportPeriodNavigation({ activePeriod, date }: { activePeriod: ReportPeriod | null; date: string }) {
  const links: { period: ReportPeriod; label: string; href: string }[] = [
    { period: 'day', label: 'Diário', href: `/relatorios?period=day&date=${date}` },
    { period: 'week', label: 'Esta semana', href: '/relatorios?period=week' },
    { period: 'month', label: 'Ciclo atual', href: '/relatorios?period=month' }
  ];

  return <nav aria-label="Período do relatório" className="mt-6 flex flex-wrap gap-2">
    {links.map((link) => {
      const active = activePeriod === link.period;
      return <a key={link.period} href={link.href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-md px-4 py-2 text-sm font-semibold ${active ? 'bg-[var(--atelier-green)] text-black' : 'border border-white/20 text-white/70 hover:text-white'}`}>
        {link.label}
      </a>;
    })}
  </nav>;
}
