'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { DashboardTrendPoint } from '@/lib/dashboard-trend';
import { DashboardMotionSection } from '@/components/dashboard-motion-card';
import { getDashboardLineDrawProps, getDashboardLineMotionProps, getDashboardPointMotionProps } from '@/components/motion-primitives';

type DashboardTrendChartProps = {
  data: DashboardTrendPoint[];
  periodLabel: string;
};

const chartWidth = 1000;
const chartHeight = 220;
const chartTop = 12;
const chartBottom = 202;

function linePoints(data: DashboardTrendPoint[], key: 'approaches' | 'interests', maximum: number) {
  const span = chartWidth - 12;
  return data.map((point, index) => {
    const x = data.length <= 1 ? chartWidth / 2 : 6 + (index / (data.length - 1)) * span;
    const y = chartBottom - (point[key] / maximum) * (chartBottom - chartTop);
    return { x, y, value: point[key], label: point.label };
  });
}

export function DashboardTrendChart({ data, periodLabel }: DashboardTrendChartProps) {
  const prefersReducedMotion = useReducedMotion() === true;
  const lineDrawProps = getDashboardLineDrawProps(prefersReducedMotion);
  const lineMotionProps = getDashboardLineMotionProps(prefersReducedMotion);
  const pointMotionProps = getDashboardPointMotionProps(prefersReducedMotion);
  const approaches = data.reduce((total, point) => total + point.approaches, 0);
  const interests = data.reduce((total, point) => total + point.interests, 0);
  const peak = Math.max(approaches ? Math.max(...data.map((point) => point.approaches)) : 0,
    interests ? Math.max(...data.map((point) => point.interests)) : 0);
  const maximum = Math.max(4, Math.ceil(peak / 4) * 4);
  const approachPoints = linePoints(data, 'approaches', maximum);
  const interestPoints = linePoints(data, 'interests', maximum);
  const ticks = Array.from({ length: 5 }, (_, index) => maximum - (maximum / 4) * index);
  const pointString = (points: typeof approachPoints) => points.map(({ x, y }) => `${x},${y}`).join(' ');

  return <DashboardMotionSection className="rounded-xl border border-white/[0.08] bg-[var(--atelier-surface)] p-4 md:p-5" testId="dashboard-trend-motion" aria-labelledby="dashboard-trend-heading">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="dashboard-trend-heading" className="text-base font-semibold tracking-tight text-white">Ritmo de prospecção</h2>
        <p className="mt-1 text-xs text-white/50">Abordagens e interesses ao longo de {periodLabel.toLowerCase()}.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" aria-label="Totais do gráfico">
        <span className="font-semibold tabular-nums text-[var(--atelier-green)]">{approaches} abordagens</span>
        <span className="font-semibold tabular-nums text-white/80">{interests} interesses</span>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/60" aria-label="Legenda do gráfico">
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--atelier-green)]" aria-hidden="true" />Abordagens</span>
      <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-white" aria-hidden="true" />Interesses</span>
      <span className="ml-auto text-white/40">{periodLabel}</span>
    </div>

    <figure className="mt-3" aria-labelledby="dashboard-trend-heading">
      <div className="relative h-[190px] pl-9 sm:h-[230px] sm:pl-11">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between pb-0.5 pt-0 text-[10px] tabular-nums text-white/35" aria-hidden="true">
          {ticks.map((tick) => <span key={tick}>{Math.round(tick)}</span>)}
        </div>
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
          {ticks.map((tick, index) => {
            const y = chartTop + ((chartBottom - chartTop) * index / 4);
            return <line key={tick} x1="0" y1={y} x2={chartWidth} y2={y} stroke="rgba(255,255,255,0.09)" strokeDasharray={index === 4 ? undefined : '4 8'} strokeWidth="1" />;
          })}
          {data.map((point, index) => {
            const x = data.length <= 1 ? chartWidth / 2 : 6 + (index / (data.length - 1)) * (chartWidth - 12);
            return <line key={point.label} x1={x} y1={chartTop} x2={x} y2={chartBottom} stroke="rgba(255,255,255,0.045)" strokeDasharray="3 8" strokeWidth="1" />;
          })}
          {approachPoints.length > 0 ? <motion.polyline {...lineDrawProps} {...lineMotionProps} points={pointString(approachPoints)} fill="none" stroke="var(--atelier-green)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-testid="dashboard-approaches-line" /> : null}
          {interestPoints.length > 0 ? <motion.polyline {...lineDrawProps} {...lineMotionProps} points={pointString(interestPoints)} fill="none" stroke="#f4f5f5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-testid="dashboard-interests-line" /> : null}
          {approachPoints.map((point) => <motion.circle {...pointMotionProps} key={`approach-${point.label}`} cx={point.x} cy={point.y} r="4.5" fill="var(--atelier-green)" stroke="var(--atelier-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${point.label}: ${point.value} abordagens`}</title></motion.circle>)}
          {interestPoints.map((point) => <motion.circle {...pointMotionProps} key={`interest-${point.label}`} cx={point.x} cy={point.y} r="4" fill="#f4f5f5" stroke="var(--atelier-surface)" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{`${point.label}: ${point.value} interesses`}</title></motion.circle>)}
        </svg>
      </div>
      <div className="ml-9 mt-2 grid gap-1 text-center text-[10px] text-white/50 sm:ml-11 sm:text-xs" style={{ gridTemplateColumns: `repeat(${Math.max(data.length, 1)}, minmax(0, 1fr))` }} aria-hidden="true">
        {data.map((point) => <span className="truncate" key={point.label}>{point.label}</span>)}
      </div>
      <ul className="sr-only" aria-label="Dados do gráfico">
        {data.map((point) => <li key={point.label}>{point.label}: {point.approaches} abordagens e {point.interests} interesses</li>)}
      </ul>
      {approaches + interests === 0 ? <figcaption className="mt-3 text-center text-xs text-white/40">Nenhuma movimentação registrada neste período.</figcaption> : null}
    </figure>
  </DashboardMotionSection>;
}
