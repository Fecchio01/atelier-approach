'use client';

import { useActionState, useState } from 'react';
import { ArrowsClockwiseIcon, CalendarBlankIcon, CarProfileIcon, CurrencyCircleDollarIcon, PaperPlaneTiltIcon, PencilSimpleIcon, PlusIcon, TargetIcon, WrenchIcon, XIcon } from '@phosphor-icons/react';

import { applyGoalSuggestions, createGoalSaveFormData, removePdfImportedCustomGoals } from '@/lib/goal-import-state';
import { customGoalGroupKeys, customGoalGroups, getCustomGoalGroup, groupCustomGoals, inferCustomGoalGroup, updateCustomGoalDraft, type CustomGoalGroup, type CustomGoalMetric } from '@/lib/custom-goals';
import type { GoalMetricActuals } from '@/lib/metrics';
import { getGoalPeriodWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { removeImportedPdfGoals, saveCustomGoalsForCycle, saveMonthlyGoal, saveWeeklyGoal } from './actions';
import { initialGoalActionState, type GoalActionState } from './goal-form-state';
import { CustomGoalMetricRow } from './custom-goal-metrics';
import { GoalImporter } from './goal-importer';
import { DashboardMotionSection } from '@/components/dashboard-motion-card';

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

const metricGroups = [
  {
    key: 'prospecting',
    title: 'Prospecção',
    description: 'Novas conversas e oportunidades para o time.',
    Icon: PaperPlaneTiltIcon,
    fields: [
      { key: 'approaches', goalKey: 'approachesTarget', label: 'Abordagens', min: '1', step: '1' },
      { key: 'interests', goalKey: 'interestsTarget', label: 'Interesses', min: '1', step: '1' }
    ]
  },
  {
    key: 'progress',
    title: 'Avanço',
    description: 'Relacionamentos que seguem pelo funil.',
    Icon: ArrowsClockwiseIcon,
    fields: [
      { key: 'meetings', goalKey: 'meetingsTarget', label: 'Reuniões', min: '1', step: '1' },
      { key: 'followUpsCompleted', goalKey: 'followUpsCompletedTarget', label: 'Follow-ups concluídos', min: '1', step: '1' },
      { key: 'sales', goalKey: 'salesTarget', label: 'Vendas fechadas', min: '1', step: '1' }
    ]
  },
  {
    key: 'revenue',
    title: 'Receita',
    description: 'Resultados que se transformam em crescimento.',
    Icon: CurrencyCircleDollarIcon,
    fields: [
      { key: 'revenue', goalKey: 'revenueTarget', label: 'Receita de vendas', min: '0.01', step: '0.01' },
      { key: 'mrr', goalKey: 'mrrTarget', label: 'MRR', min: '0.01', step: '0.01' },
      { key: 'conversionRate', goalKey: 'conversionRateTarget', label: 'Taxa de conversão', min: '1', max: '100', step: '0.1' }
    ]
  }
] as const;

const metricGroupIcons = {
  prospecting: PaperPlaneTiltIcon,
  progress: ArrowsClockwiseIcon,
  revenue: CurrencyCircleDollarIcon,
  vehicles: CarProfileIcon,
  operations: WrenchIcon,
  other: TargetIcon
} as const;

const primaryGroupKeys = new Set<CustomGoalGroup>(['prospecting', 'progress', 'revenue']);

type GoalTargetField = typeof metricGroups[number]['fields'][number]['key'];
type GoalTargetDraft = Record<GoalTargetField, string>;

function goalDraftFromRecord(goal: GoalRecord): GoalTargetDraft {
  return Object.fromEntries(metricGroups.flatMap((group) => group.fields.map((field) => [field.key, goal?.[field.goalKey]?.toString() ?? '']))) as GoalTargetDraft;
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
});
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function formatMetricValue(metric: GoalTargetField, value: number) {
  if (metric === 'revenue' || metric === 'mrr') return moneyFormatter.format(value);
  if (metric === 'conversionRate') return `${numberFormatter.format(value)}%`;
  return numberFormatter.format(value);
}

function inclusiveEnd(period: GoalPeriodWindow) {
  return new Date(period.end.getTime() - 1);
}

function cycleProgress(period: GoalPeriodWindow, now: Date) {
  const duration = period.end.getTime() - period.start.getTime();
  const elapsed = now.getTime() - period.start.getTime();
  const ratio = Math.max(0, Math.min(1, elapsed / duration));
  return { ratio, percent: Math.round(ratio * 100), daysLeft: Math.max(0, Math.ceil((period.end.getTime() - now.getTime()) / 86_400_000)) };
}

export function GoalForm({
  kind,
  period,
  goal,
  actuals,
  monthlyStartDay,
  now
}: {
  kind: 'WEEKLY' | 'MONTHLY';
  period: GoalPeriodWindow;
  goal: GoalRecord;
  actuals: GoalMetricActuals;
  monthlyStartDay: number;
  now: Date;
}) {
  const action = kind === 'WEEKLY' ? saveWeeklyGoal : saveMonthlyGoal;
  const [state, formAction, pending] = useActionState<GoalActionState, FormData>(action, initialGoalActionState);
  const [draft, setDraft] = useState(() => goalDraftFromRecord(goal));
  const [customGoals, setCustomGoals] = useState(() => goal?.customGoals ?? []);
  const [editingField, setEditingField] = useState<GoalTargetField | null>(null);
  const [editingCustomGoalId, setEditingCustomGoalId] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [customGoalSavePending, setCustomGoalSavePending] = useState(false);
  const [customGoalsDirty, setCustomGoalsDirty] = useState(false);
  const [importerBusy, setImporterBusy] = useState(false);
  const [importerRevision, setImporterRevision] = useState(0);
  const [goalNotice, setGoalNotice] = useState<GoalActionState | null>(null);
  const [monthlyStartDayDraft, setMonthlyStartDayDraft] = useState(String(monthlyStartDay));
  const numericStartDay = Number(monthlyStartDayDraft);
  const displayedPeriod = kind === 'MONTHLY' && Number.isInteger(numericStartDay) && numericStartDay >= 1 && numericStartDay <= 31
    ? getGoalPeriodWindow('MONTHLY', now, numericStartDay, period.start)
    : period;
  const progress = cycleProgress(displayedPeriod, now);
  const endLabel = inclusiveEnd(displayedPeriod);
  const daysLabel = progress.daysLeft === 1 ? '1 dia restante' : `${progress.daysLeft} dias restantes`;
  const panelTitle = kind === 'WEEKLY' ? 'Metas semanais da equipe' : 'Metas mensais da equipe';

  async function persistCustomGoalList(nextCustomGoals: CustomGoalMetric[]): Promise<GoalActionState> {
    setCustomGoalSavePending(true);
    setGoalNotice({ status: 'idle', message: 'Salvando indicador…' });
    try {
      const result = await saveCustomGoalsForCycle(kind, JSON.stringify(nextCustomGoals));
      setGoalNotice(result);
      if (result.status === 'saved') setCustomGoalsDirty(false);
      return result;
    } catch {
      const result: GoalActionState = { status: 'error', message: 'Não foi possível salvar o indicador agora. Ele continua no formulário; tente novamente.' };
      setGoalNotice(result);
      return result;
    } finally {
      setCustomGoalSavePending(false);
    }
  }

  function commitCustomGoal(id: string, inferredGroup?: CustomGoalGroup) {
    if (!customGoalsDirty || pending || importPending || importerBusy || customGoalSavePending) return;
    const nextCustomGoals = inferredGroup
      ? customGoals.map((item) => item.id === id ? { ...item, group: inferredGroup } : item)
      : customGoals;
    const previousGoal = customGoals.find((item) => item.id === id);
    const updatedGoal = nextCustomGoals.find((item) => item.id === id);
    if (previousGoal && updatedGoal && getCustomGoalGroup(previousGoal) !== getCustomGoalGroup(updatedGoal)) {
      setCustomGoals(nextCustomGoals);
    }
    void persistCustomGoalList(nextCustomGoals);
  }

  async function applyImportedSuggestions(suggestions: Parameters<typeof applyGoalSuggestions>[2]): Promise<GoalActionState> {
    setGoalNotice(null);
    const merged = applyGoalSuggestions(draft, customGoals, suggestions);
    const nextDraft = { ...draft, ...merged.targets };
    setDraft(nextDraft);
    setCustomGoals(merged.customGoals);

    setImportPending(true);
    try {
      const result = await action(initialGoalActionState, createGoalSaveFormData(
        nextDraft,
        merged.customGoals,
        kind === 'MONTHLY' ? monthlyStartDayDraft : undefined
      ));
      if (result.status === 'saved') setCustomGoalsDirty(false);
      return result;
    } catch {
      return { status: 'error', message: 'Não foi possível salvar as metas importadas. Elas continuam no formulário; tente salvar novamente.' };
    } finally {
      setImportPending(false);
    }
  }

  async function restoreDefaultGoals() {
    const nextCustomGoals = removePdfImportedCustomGoals(customGoals);
    if (nextCustomGoals.length === customGoals.length || pending || importPending || importerBusy || customGoalSavePending) return;

    setImportPending(true);
    setGoalNotice({ status: 'idle', message: 'Removendo metas importadas…' });
    try {
      const result = await removeImportedPdfGoals(kind);
      setGoalNotice(result);
      if (result.status === 'saved') {
        setCustomGoals(nextCustomGoals);
        setEditingCustomGoalId((current) => nextCustomGoals.some((goal) => goal.id === current) ? current : null);
        setImporterRevision((current) => current + 1);
      }
    } catch {
      setGoalNotice({ status: 'error', message: 'Não foi possível remover as metas importadas agora. Tente novamente.' });
    } finally {
      setImportPending(false);
    }
  }

  function updateCustomGoal(id: string, changes: Partial<CustomGoalMetric>) {
    setGoalNotice(null);
    setCustomGoalsDirty(true);
    const nextCustomGoals = customGoals.map((item) => item.id === id ? updateCustomGoalDraft(item, changes) : item);
    const previousGoal = customGoals.find((item) => item.id === id);
    const updatedGoal = nextCustomGoals.find((item) => item.id === id);
    setCustomGoals(nextCustomGoals);

    // A theme change (including a name that infers a different theme) moves the
    // row to another section and unmounts its editor. Persist the complete,
    // latest list now instead of depending on blur from that soon-removed input.
    if (previousGoal && updatedGoal && getCustomGoalGroup(previousGoal) !== getCustomGoalGroup(updatedGoal)) {
      void persistCustomGoalList(nextCustomGoals);
    }
  }

  function addCustomGoal() {
    if (pending || importPending || importerBusy || customGoalSavePending) return;
    setGoalNotice(null);
    const id = crypto.randomUUID();
    const nextCustomGoals = [...customGoals, { id, name: 'Novo indicador', target: 1, current: 0, icon: 'target' as const, group: 'other' as const, source: 'manual' as const, origin: 'manual' as const }];
    setCustomGoals(nextCustomGoals);
    setCustomGoalsDirty(true);
    setEditingCustomGoalId(id);
    void persistCustomGoalList(nextCustomGoals);
  }

  async function removeCustomGoal(id: string) {
    if (pending || importPending || importerBusy || customGoalSavePending) return;
    setGoalNotice(null);
    const nextCustomGoals = customGoals.filter((item) => item.id !== id);
    const result = await persistCustomGoalList(nextCustomGoals);
    if (result.status === 'saved') {
      setCustomGoals(nextCustomGoals);
      setEditingCustomGoalId((current) => current === id ? null : current);
    }
  }

  const customGoalsByGroup = groupCustomGoals(customGoals);

  return <form action={formAction} className="space-y-6 [&_button]:transition-[transform,opacity] [&_button]:duration-[var(--atelier-motion-duration)] [&_button]:ease-[var(--atelier-motion-easing)]">
    <input type="hidden" name="customGoals" value={JSON.stringify(customGoals)} />
    <GoalImporter key={importerRevision} disabled={importPending || customGoalSavePending || pending} onActivityChange={setImporterBusy} onApply={applyImportedSuggestions} />
    <section aria-label={kind === 'WEEKLY' ? 'Ciclo semanal atual' : 'Ciclo mensal atual'} className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[linear-gradient(118deg,#192224,#11161b)] p-4 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.055] text-[var(--atelier-green)]"><CalendarBlankIcon size={22} weight="regular" /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--atelier-green)]">Ciclo atual</p>
            <h2 className="mt-1 text-lg font-semibold">Jornada do ciclo</h2>
            <p className="mt-1 text-sm text-white/55">Acompanhe o período da equipe e ajuste as metas quando precisar.</p>
          </div>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs text-white/65">{daysLabel}</span>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <div className="relative px-2 pb-1 pt-5">
            <div className="h-px w-full bg-white/[0.15]" />
            <div className="absolute left-2 right-2 top-[19px] h-[2px] origin-left rounded-full bg-[var(--atelier-green)]" style={{ transform: `scaleX(${progress.ratio})` }} />
            <span className="absolute top-[12px] size-4 -translate-x-1/2 rounded-full border-[3px] border-[var(--atelier-green-hover)] bg-[#263420] shadow-[0_0_0_4px_rgba(167,216,26,0.08)]" style={{ left: `${progress.percent}%` }} aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-start justify-between gap-4 text-xs">
            <div><span className="block font-medium text-white/80">Início</span><span className="mt-1 block text-white/45">{dateFormatter.format(displayedPeriod.start)}</span></div>
            <div className="text-right"><span className="block font-medium text-white/80">Fim do ciclo</span><span className="mt-1 block text-white/45">{dateFormatter.format(endLabel)}</span></div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-white/55">
            <span className="size-1.5 rounded-full bg-[var(--atelier-green)]" />
            <span><strong className="font-semibold text-white/80">{progress.percent}%</strong> do período percorrido</span>
          </div>
        </div>

        {kind === 'MONTHLY' ? <label className="grid min-w-48 gap-2 text-xs font-medium text-white/65">
          Dia de início do ciclo mensal
          <span className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#171e22] px-3 py-2.5 focus-within:border-[var(--atelier-green)]/55">
            <CalendarBlankIcon size={17} className="shrink-0 text-white/40" />
            <input aria-label="Dia de início do ciclo mensal" name="monthlyStartDay" type="number" inputMode="numeric" min="1" max="31" step="1" required value={monthlyStartDayDraft} onChange={(event) => setMonthlyStartDayDraft(event.target.value)} className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/30" />
            <span className="shrink-0 text-xs text-white/45">de cada mês</span>
          </span>
          <span className="text-[11px] font-normal text-white/40">O próximo ciclo vira no dia {monthlyStartDayDraft || monthlyStartDay}.</span>
        </label> : <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-xs text-white/50">
          Semana de segunda a domingo
        </div>}
      </div>
    </section>

    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">Alvos da equipe · {dateFormatter.format(displayedPeriod.start)} – {dateFormatter.format(endLabel)}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em]">Marcos da meta</h2>
        <p className="mt-1 text-sm text-white/50">Defina os resultados que o time quer alcançar neste ciclo.</p>
      </div>
      <button type="submit" disabled={pending || importPending || importerBusy || customGoalSavePending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--atelier-green)] px-5 py-2.5 text-sm font-semibold text-[#11170b] hover:bg-[var(--atelier-green-hover)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:w-auto">
        {importPending ? 'Salvando alterações…' : pending || importerBusy || customGoalSavePending ? 'Salvando metas…' : 'Salvar metas'}
      </button>
    </div>

    <section aria-labelledby="custom-goals-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <h3 id="custom-goals-heading" className="font-semibold text-white/90">Indicadores personalizados</h3>
          <p className="mt-1 text-xs leading-5 text-white/45">Metas organizadas dentro do tema correspondente para o time acompanhar o ciclo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {customGoals.some((customGoal) => customGoal.origin === 'pdf') && <button
            type="button"
            onClick={() => void restoreDefaultGoals()}
            disabled={pending || importPending || importerBusy || customGoalSavePending}
            title="Remove apenas indicadores adicionados por PDF; preserva metas padrão e manuais."
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.09] px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            <ArrowsClockwiseIcon size={15} aria-hidden="true" /> Voltar ao padrão
          </button>}
          <button type="button" onClick={addCustomGoal} disabled={customGoals.length >= 30 || pending || importPending || importerBusy || customGoalSavePending} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--atelier-green)]/35 px-3 py-2 text-xs font-semibold text-[var(--atelier-green)] transition hover:bg-[var(--atelier-green)]/[0.08] active:scale-[0.98] disabled:opacity-40">
            <PlusIcon size={15} aria-hidden="true" /> Adicionar indicador
          </button>
        </div>
      </div>

    <div className="grid gap-4 xl:grid-cols-3">
      {metricGroups.map(({ key, title, description, Icon, fields }) => <DashboardMotionSection key={key} aria-labelledby={`${key}-heading`} className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#11171b] p-4 sm:p-5">
        <div className="flex items-start gap-3 border-b border-white/[0.07] pb-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><Icon size={20} weight="regular" /></span>
          <div><h3 id={`${key}-heading`} className="font-semibold text-white/90">{title}</h3><p className="mt-1 text-xs leading-5 text-white/45">{description}</p></div>
        </div>
        <div className="divide-y divide-white/[0.06]">
          {fields.map((field) => {
            const target = draft[field.key] === '' ? null : Number(draft[field.key]);
            const progressPercent = target !== null && target > 0 && !(field.key === 'conversionRate' && actuals.approaches === 0)
              ? Math.round((actuals[field.key] / target) * 100)
              : null;
            const progressWidth = Math.min(100, Math.max(0, progressPercent ?? 0));
            const isEditing = editingField === field.key;

            return <div key={field.key} className="py-4 first:pt-4 last:pb-1">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(104px,124px)] items-center gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white/85">{field.label}</span>
                  <p aria-label={`${field.label}: ${formatMetricValue(field.key, actuals[field.key])} de ${target === null ? 'meta não definida' : formatMetricValue(field.key, target)}`} className="mt-1.5 flex min-w-0 items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                    <span className="truncate text-[var(--atelier-green)]">{formatMetricValue(field.key, actuals[field.key])}</span>
                    <span className="shrink-0 text-xs font-normal text-white/35">/</span>
                    <span className="truncate text-white/65">{target === null ? '—' : formatMetricValue(field.key, target)}</span>
                  </p>
                </div>

                <div className="flex min-w-0 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#1b2328] py-1.5 pl-2.5 pr-1.5 focus-within:border-[var(--atelier-green)]/50">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[10px] font-medium leading-4 text-white/45">Meta</span>
                    {isEditing ? <input
                      autoFocus
                      aria-label={`Meta para ${field.label.toLowerCase()}`}
                      name={field.key}
                      type="number"
                      inputMode="decimal"
                      min={field.min}
                      step={field.step}
                      {...('max' in field ? { max: field.max } : {})}
                      value={draft[field.key]}
                      onChange={(event) => { setGoalNotice(null); setDraft((current) => ({ ...current, [field.key]: event.target.value })); }}
                      placeholder="—"
                      className="goal-target-number w-full min-w-0 bg-transparent text-sm font-semibold leading-5 text-white outline-none placeholder:text-white/35"
                    /> : <>
                      <span className="block truncate text-sm font-semibold leading-5 text-white/85">{target === null ? 'Definir' : formatMetricValue(field.key, target)}</span>
                      <input type="hidden" name={field.key} value={draft[field.key]} />
                    </>}
                  </div>
                  <button
                    type="button"
                    aria-label={`${isEditing ? 'Fechar edição da' : 'Editar'} meta para ${field.label.toLowerCase()}`}
                    aria-pressed={isEditing}
                    onClick={() => setEditingField(isEditing ? null : field.key)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/55 transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-white/[0.07] hover:text-[var(--atelier-green)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] active:scale-[0.96]"
                  >
                    {isEditing ? <XIcon size={16} weight="bold" aria-hidden="true" /> : <PencilSimpleIcon size={16} weight="regular" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2.5">
                <div
                  role="progressbar"
                  aria-label={`Progresso de ${field.label.toLowerCase()}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressWidth}
                  aria-valuetext={progressPercent === null ? 'Defina uma meta para calcular o progresso' : `${progressPercent}% da meta`}
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.12]"
                >
                  <span className="block h-full origin-left rounded-full bg-gradient-to-r from-[var(--atelier-green)] to-[var(--atelier-green-hover)] transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)]" style={{ transform: `scaleX(${progressWidth / 100})` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/45">{progressPercent === null ? '—' : `${progressPercent}%`}</span>
              </div>
            </div>;
          })}
          {customGoalsByGroup[key].map((customGoal, index) => <CustomGoalMetricRow
            key={customGoal.id}
            goal={customGoal}
            index={index}
            actuals={actuals}
            isEditing={editingCustomGoalId === customGoal.id}
            disabled={pending || importPending || importerBusy || customGoalSavePending}
            onToggle={() => setEditingCustomGoalId((current) => current === customGoal.id ? null : customGoal.id)}
            onChange={(changes) => updateCustomGoal(customGoal.id, changes)}
            onCommit={commitCustomGoal}
            onRemove={() => void removeCustomGoal(customGoal.id)}
          />)}
        </div>
      </DashboardMotionSection>)}
      {customGoalGroupKeys.filter((key): key is Exclude<CustomGoalGroup, 'prospecting' | 'progress' | 'revenue'> => !primaryGroupKeys.has(key) && customGoalsByGroup[key].length > 0).map((groupKey) => {
        const { label, description } = customGoalGroups[groupKey];
        const GroupIcon = metricGroupIcons[groupKey];
        return <DashboardMotionSection key={groupKey} aria-labelledby={`${groupKey}-heading`} className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#11171b] p-4 sm:p-5">
          <div className="flex items-start gap-3 border-b border-white/[0.07] pb-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><GroupIcon size={20} weight="regular" /></span>
            <div><h3 id={`${groupKey}-heading`} className="font-semibold text-white/90">{label}</h3><p className="mt-1 text-xs leading-5 text-white/45">{description}</p></div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {customGoalsByGroup[groupKey].map((customGoal, index) => <CustomGoalMetricRow
              key={customGoal.id}
              goal={customGoal}
              index={index}
              actuals={actuals}
              isEditing={editingCustomGoalId === customGoal.id}
              disabled={pending || importPending || importerBusy || customGoalSavePending}
              onToggle={() => setEditingCustomGoalId((current) => current === customGoal.id ? null : customGoal.id)}
              onChange={(changes) => updateCustomGoal(customGoal.id, changes)}
              onCommit={commitCustomGoal}
              onRemove={() => void removeCustomGoal(customGoal.id)}
            />)}
          </div>
        </DashboardMotionSection>;
      })}
    </div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.07] pt-5">
      <p role="status" aria-live="polite" className={`text-sm ${(goalNotice ?? state).status === 'error' ? 'text-red-300' : (goalNotice ?? state).status === 'saved' ? 'text-[var(--atelier-green)]' : 'text-white/45'}`}>
        {(goalNotice ?? state).message || 'Os resultados deste ciclo também aparecem no painel e nos relatórios.'}
      </p>
    </div>
  </form>;
}
