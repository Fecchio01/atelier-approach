'use client';

import { useEffect, useRef, useState } from 'react';

import { readGoalPeriodSelection, writeGoalPeriodSelection, type GoalPeriodSelection } from '@/lib/goal-period-selection';
import type { CustomGoalMetric } from '@/lib/custom-goals';
import type { GoalMetricActuals } from '@/lib/metrics';
import type { GoalPeriodWindow } from '@/lib/goal-periods';
import { GoalForm } from './goal-form';

type GoalRecord = {
  approachesTarget: number | null;
  interestsTarget: number | null;
  meetingsTarget: number | null;
  salesTarget: number | null;
  revenueTarget: number | null;
  mrrTarget: number | null;
  followUpsCompletedTarget: number | null;
  conversionRateTarget: number | null;
  customGoals: CustomGoalMetric[];
} | null;

export function GoalCenter({
  weeklyPeriod,
  monthlyPeriod,
  weeklyGoal,
  monthlyGoal,
  monthlyStartDay,
  now,
  weeklyActuals,
  monthlyActuals,
  weeklyCustomActuals,
  monthlyCustomActuals
}: {
  weeklyPeriod: GoalPeriodWindow;
  monthlyPeriod: GoalPeriodWindow;
  weeklyGoal: GoalRecord;
  monthlyGoal: GoalRecord;
  monthlyStartDay: number;
  now: Date;
  weeklyActuals: GoalMetricActuals;
  monthlyActuals: GoalMetricActuals;
  weeklyCustomActuals: Record<string, number>;
  monthlyCustomActuals: Record<string, number>;
}) {
  const [selectedKind, setSelectedKind] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const selectionChangedByUser = useRef(false);

  useEffect(() => {
    if (selectionChangedByUser.current) return;
    try {
      setSelectedKind(readGoalPeriodSelection(window.localStorage));
    } catch {
      // Keep the weekly default if browser storage is unavailable.
    }
  }, []);

  function selectPeriod(kind: GoalPeriodSelection) {
    selectionChangedByUser.current = true;
    setSelectedKind(kind);
    try {
      writeGoalPeriodSelection(window.localStorage, kind);
    } catch {
      // The selected period still works for this visit if storage is unavailable.
    }
  }

  return <div className="mt-7">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/42">Período da equipe</p>
        <p className="mt-1 text-sm text-white/55">Escolha o ciclo que deseja configurar.</p>
      </div>
      <div role="tablist" aria-label="Período das metas" className="inline-flex rounded-xl border border-white/[0.09] bg-[#101519] p-1">
        {([['WEEKLY', 'Semanal'], ['MONTHLY', 'Mensal']] as const).map(([kind, label]) => <button
          key={kind}
          id={`goal-tab-${kind.toLowerCase()}`}
          type="button"
          role="tab"
          aria-selected={selectedKind === kind}
          aria-controls={`goal-panel-${kind.toLowerCase()}`}
          onClick={() => selectPeriod(kind)}
          className={`min-h-10 min-w-24 rounded-lg px-4 text-sm font-medium transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] active:scale-[0.98] ${selectedKind === kind ? 'bg-[var(--atelier-green)] text-[#101507]' : 'text-white/55 hover:bg-white/[0.05] hover:text-white'}`}
        >{label}</button>)}
      </div>
    </div>

    <div id="goal-panel-weekly" role="tabpanel" aria-labelledby="goal-tab-weekly" aria-label="Metas semanais da equipe" hidden={selectedKind !== 'WEEKLY'} className="mt-5">
      <GoalForm kind="WEEKLY" period={weeklyPeriod} goal={weeklyGoal} actuals={weeklyActuals} customActuals={weeklyCustomActuals} monthlyStartDay={monthlyStartDay} now={now} />
    </div>
    <div id="goal-panel-monthly" role="tabpanel" aria-labelledby="goal-tab-monthly" aria-label="Metas mensais da equipe" hidden={selectedKind !== 'MONTHLY'} className="mt-5">
      <GoalForm kind="MONTHLY" period={monthlyPeriod} goal={monthlyGoal} actuals={monthlyActuals} customActuals={monthlyCustomActuals} monthlyStartDay={monthlyStartDay} now={now} />
    </div>
  </div>;
}
