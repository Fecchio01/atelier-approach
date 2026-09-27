'use client';

import { useActionState, useState } from 'react';

import { saveMonthlyGoal, saveWeeklyGoal } from './actions';
import { initialGoalActionState, type GoalActionState } from './goal-form-state';
import type { GoalPeriodWindow } from '@/lib/goal-periods';

type GoalRecord = {
  approachesTarget: number | null;
  interestsTarget: number | null;
  meetingsTarget: number | null;
  salesTarget: number | null;
  revenueTarget: number | null;
  mrrTarget: number | null;
  followUpsCompletedTarget: number | null;
  conversionRateTarget: number | null;
} | null;

const metricFields = [
  { key: 'approaches', goalKey: 'approachesTarget', label: 'Abordagens registradas', type: 'number', min: '1', step: '1' },
  { key: 'interests', goalKey: 'interestsTarget', label: 'Interesses registrados', type: 'number', min: '1', step: '1' },
  { key: 'meetings', goalKey: 'meetingsTarget', label: 'Reuniões e retornos', type: 'number', min: '1', step: '1' },
  { key: 'sales', goalKey: 'salesTarget', label: 'Vendas fechadas', type: 'number', min: '1', step: '1' },
  { key: 'followUpsCompleted', goalKey: 'followUpsCompletedTarget', label: 'Follow-ups concluídos', type: 'number', min: '1', step: '1' },
  { key: 'revenue', goalKey: 'revenueTarget', label: 'Receita de vendas (R$)', type: 'number', min: '0.01', step: '0.01' },
  { key: 'mrr', goalKey: 'mrrTarget', label: 'MRR (R$)', type: 'number', min: '0.01', step: '0.01' },
  { key: 'conversionRate', goalKey: 'conversionRateTarget', label: 'Taxa de conversão (%)', type: 'number', min: '1', max: '100', step: '0.1' }
] as const;

type GoalTargetField = typeof metricFields[number]['key'];
type GoalTargetDraft = Record<GoalTargetField, string>;

function goalDraftFromRecord(goal: GoalRecord): GoalTargetDraft {
  return Object.fromEntries(metricFields.map((field) => [field.key, goal?.[field.goalKey]?.toString() ?? ''])) as GoalTargetDraft;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function goalPeriodLabel(period: GoalPeriodWindow) {
  return `${formatDate(period.start)} a ${formatDate(new Date(period.end.getTime() - 1))}`;
}

export function GoalForm({
  kind,
  period,
  goal,
  monthlyStartDay
}: {
  kind: 'WEEKLY' | 'MONTHLY';
  period: GoalPeriodWindow;
  goal: GoalRecord;
  monthlyStartDay: number;
}) {
  const action = kind === 'WEEKLY' ? saveWeeklyGoal : saveMonthlyGoal;
  const [state, formAction, pending] = useActionState<GoalActionState, FormData>(action, initialGoalActionState);
  const [draft, setDraft] = useState(() => goalDraftFromRecord(goal));
  const [monthlyStartDayDraft, setMonthlyStartDayDraft] = useState(String(monthlyStartDay));
  const heading = kind === 'WEEKLY' ? 'Meta semanal da equipe' : 'Meta mensal da equipe';

  return <form action={formAction} className="rounded-2xl border border-white/[0.09] bg-[#111411] p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold">{heading}</h2>
        <p className="mt-1 text-sm text-white/60">Ciclo: {goalPeriodLabel(period)}</p>
      </div>
      {kind === 'MONTHLY' ? <label className="grid gap-2 text-sm text-white/70">Dia de início do ciclo
        <input name="monthlyStartDay" type="number" inputMode="numeric" min="1" max="31" step="1" required value={monthlyStartDayDraft} onChange={(event) => setMonthlyStartDayDraft(event.target.value)} className="w-32 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white" />
      </label> : null}
    </div>

    <fieldset className="mt-6">
      <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Produção comercial</legend>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricFields.slice(0, 5).map((field) => <label key={field.key} className="grid gap-2 text-sm text-white/75">{field.label}
          <input name={field.key} type={field.type} inputMode="decimal" min={field.min} step={field.step} value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Sem meta" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/30" />
        </label>)}
      </div>
    </fieldset>

    <fieldset className="mt-6">
      <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Receita e eficiência</legend>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricFields.slice(5).map((field) => <label key={field.key} className="grid gap-2 text-sm text-white/75">{field.label}
          <input name={field.key} type={field.type} inputMode="decimal" min={field.min} step={field.step} {...('max' in field ? { max: field.max } : {})} value={draft[field.key]} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder="Sem meta" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/30" />
        </label>)}
      </div>
    </fieldset>

    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-[var(--atelier-green)] px-5 py-2 font-semibold text-black disabled:cursor-wait disabled:opacity-60">
        {pending ? 'Salvando…' : 'Salvar meta'}
      </button>
      <p aria-live="polite" className={`text-sm ${state.status === 'error' ? 'text-red-300' : 'text-white/65'}`}>{state.message || 'Campos vazios ficam sem meta; o realizado continua aparecendo nos relatórios.'}</p>
    </div>
  </form>;
}
