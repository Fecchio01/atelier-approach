'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { getMotionTransition } from './motion-primitives';

type Period = 'day' | 'week' | 'month';

const periods: readonly [Period, string][] = [['day', 'Hoje'], ['week', 'Semana'], ['month', 'Ciclo mensal']];

export function DashboardPeriodSelector({ period }: { period: Period }) {
  return <nav aria-label="Período do dashboard" className="flex w-fit rounded-lg border border-white/10 bg-[#111719] p-1">
    {periods.map(([value, label]) => {
      const selected = period === value;
      return <Link
        key={value}
        href={`/?period=${value}`}
        aria-current={selected ? 'page' : undefined}
        className={`relative isolate rounded-md px-3 py-2 text-xs font-semibold transition-colors duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] sm:px-3.5 ${selected ? 'text-[#101411]' : 'text-white/60 hover:text-white'}`}
      >
        {selected ? <motion.span
          layoutId="dashboard-period-selection"
          aria-hidden="true"
          transition={getMotionTransition(false, 'fast')}
          className="absolute inset-0 -z-10 rounded-md bg-[var(--atelier-green)]"
        /> : null}
        <span className="relative">{label}</span>
      </Link>;
    })}
  </nav>;
}
