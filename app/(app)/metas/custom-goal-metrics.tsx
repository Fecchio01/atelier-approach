'use client';

import {
  ArrowsClockwiseIcon, CalendarBlankIcon, CarProfileIcon, ChartLineUpIcon, CheckSquareOffsetIcon,
  CurrencyCircleDollarIcon, HandshakeIcon, PaperPlaneTiltIcon, PencilSimpleIcon, StarIcon, TargetIcon,
  TrashIcon, TrophyIcon, UsersThreeIcon, WrenchIcon, XIcon
} from '@phosphor-icons/react';

import {
  customGoalGroupKeys, customGoalGroups, customGoalIconLabels, customGoalIcons, customGoalSourceLabels,
  getCustomGoalCurrent, getCustomGoalGroup, getCustomGoalIcon, inferCustomGoalGroup,
  type CustomGoalGroup, type CustomGoalIcon, type CustomGoalMetric, type CustomGoalSource
} from '@/lib/custom-goals';
import type { GoalMetricActuals } from '@/lib/metrics';

const iconComponents: Record<CustomGoalIcon, typeof TargetIcon> = {
  target: TargetIcon,
  prospecting: PaperPlaneTiltIcon,
  progress: ArrowsClockwiseIcon,
  car: CarProfileIcon,
  users: UsersThreeIcon,
  currency: CurrencyCircleDollarIcon,
  chart: ChartLineUpIcon,
  checklist: CheckSquareOffsetIcon,
  star: StarIcon,
  handshake: HandshakeIcon,
  calendar: CalendarBlankIcon,
  wrench: WrenchIcon,
  trophy: TrophyIcon
};

function formatValue(value: number, unit?: string) {
  if (!Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  return unit === 'R$' ? `R$ ${formatted}` : `${formatted}${unit ? ` ${unit}` : ''}`;
}

export function CustomGoalMetricRow({
  goal,
  index,
  actuals,
  isEditing,
  disabled = false,
  onToggle,
  onChange,
  onCommit,
  onRemove
}: {
  goal: CustomGoalMetric;
  index: number;
  actuals: GoalMetricActuals;
  isEditing: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<CustomGoalMetric>) => void;
  onCommit: () => void;
  onRemove: () => void;
}) {
  const icon = getCustomGoalIcon(goal);
  const Icon = iconComponents[icon];
  const group = getCustomGoalGroup(goal);
  const source = goal.source ?? 'manual';
  const current = getCustomGoalCurrent(goal, actuals);
  const targetValid = Number.isFinite(goal.target) && goal.target >= 0;
  const currentValid = Number.isFinite(current) && current >= 0;
  const percent = targetValid && currentValid
    ? goal.target === 0 ? (current === 0 ? 100 : 0) : Math.round(current / goal.target * 100)
    : 0;
  const progressWidth = Math.min(100, Math.max(0, percent));
  const goalLabel = goal.name || `Indicador ${index + 1}`;

  function updateGoal(changes: Partial<CustomGoalMetric>) {
    const nextName = changes.name ?? goal.name;
    const nextUnit = changes.unit ?? goal.unit;
    const followsName = getCustomGoalGroup(goal) === inferCustomGoalGroup(goal.name, goal.unit);
    onChange({
      ...changes,
      ...(followsName && ('name' in changes || 'unit' in changes)
        ? { group: inferCustomGoalGroup(nextName, nextUnit) }
        : {})
    });
  }

  return <div className="py-4 first:pt-4 last:pb-1" onBlur={(event) => {
    const nextFocus = event.relatedTarget;
    if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) onCommit();
  }}>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(132px,152px)] items-center gap-3">
      <div className="min-w-0">
        <span title={goalLabel} className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-white/85">
          <Icon size={15} weight="regular" className="shrink-0 text-[var(--atelier-green)]/80" aria-hidden="true" />
          <span className="truncate">{goalLabel}</span>
        </span>
        <p aria-label={`${goalLabel}: ${formatValue(current, goal.unit)} de ${formatValue(goal.target, goal.unit)}`} className="mt-1.5 flex min-w-0 items-baseline gap-1.5 text-sm font-semibold tabular-nums">
          <span className="truncate text-[var(--atelier-green)]">{formatValue(current, goal.unit)}</span>
          <span className="shrink-0 text-xs font-normal text-white/35">/</span>
          <span className="truncate text-white/65">{formatValue(goal.target, goal.unit)}</span>
        </p>
        <span className="mt-1 block truncate text-[10px] text-white/45">{source === 'manual' ? 'Progresso manual' : `CRM · ${customGoalSourceLabels[source]}`}</span>
      </div>

      <div className="flex min-w-0 items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#1b2328] py-1.5 pl-2.5 pr-1 focus-within:border-[var(--atelier-green)]/50">
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium leading-4 text-white/45">Meta</span>
          <span className="block truncate text-sm font-semibold leading-5 text-white/85">{formatValue(goal.target, goal.unit)}</span>
        </div>
        <button type="button" aria-label={`Remover ${goalLabel}`} disabled={disabled} onClick={onRemove} className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 active:scale-[0.98] disabled:cursor-wait disabled:opacity-50">
          <TrashIcon size={15} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`${isEditing ? 'Fechar edição de' : 'Editar'} ${goalLabel}`} aria-expanded={isEditing} aria-controls={`custom-goal-edit-${goal.id}`} disabled={disabled} onClick={onToggle} className="flex size-8 shrink-0 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.07] hover:text-[var(--atelier-green)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-50">
          {isEditing ? <XIcon size={16} aria-hidden="true" /> : <PencilSimpleIcon size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>

    <div className="mt-3 flex items-center gap-2.5">
      <div role="progressbar" aria-label={`Progresso de ${goalLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressWidth} aria-valuetext={`${percent}% da meta`} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.12]">
        <span className="block h-full rounded-full bg-gradient-to-r from-[#81e986] to-[var(--atelier-green)] transition-[width] duration-300" style={{ width: `${progressWidth}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/45">{percent}%</span>
    </div>

    {isEditing && <div id={`custom-goal-edit-${goal.id}`} className="mt-4 border-t border-white/[0.07] pt-4">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
          <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
            Nome do indicador
            <input aria-label={`Nome do indicador ${index + 1}`} disabled={disabled} maxLength={80} value={goal.name} onChange={(event) => updateGoal({ name: event.target.value })} placeholder="Ex.: Carros entregues" className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm font-medium text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55" />
          </label>
          <label className="grid gap-1 text-[11px] text-white/45">
            Tema
            <select aria-label={`Tema do indicador ${index + 1}`} disabled={disabled} value={group} onChange={(event) => updateGoal({ group: event.target.value as CustomGoalGroup })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55">
              {customGoalGroupKeys.map((key) => <option key={key} value={key}>{customGoalGroups[key].label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
            Ícone
            <select aria-label={`Ícone do indicador ${index + 1}`} disabled={disabled} value={icon} onChange={(event) => updateGoal({ icon: event.target.value as CustomGoalIcon })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55">
              {customGoalIcons.map((key) => <option key={key} value={key}>{customGoalIconLabels[key]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] text-white/45">
            Unidade (opcional)
            <input aria-label={`Unidade do indicador ${index + 1}`} disabled={disabled} maxLength={24} value={goal.unit ?? ''} onChange={(event) => updateGoal({ unit: event.target.value })} placeholder="unidades, R$, %" className="h-9 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55" />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
            Origem do progresso
            <select aria-label={`Origem do indicador ${index + 1}`} disabled={disabled} value={source} onChange={(event) => updateGoal({ source: event.target.value as CustomGoalSource })} className="h-9 w-full min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55">
              {Object.entries(customGoalSourceLabels).map(([key, label]) => <option key={key} value={key}>{key === 'manual' ? label : `CRM · ${label}`}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
              Meta
              <input aria-label={`Meta do indicador ${index + 1}`} disabled={disabled} type="number" inputMode="decimal" min="0" step="any" value={targetValid ? goal.target : ''} onChange={(event) => updateGoal({ target: event.target.value === '' ? Number.NaN : Number(event.target.value) })} className="goal-target-number h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:opacity-55" />
            </label>
            <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
              Progresso
              <input aria-label={`Progresso do indicador ${index + 1}`} type="number" inputMode="decimal" min="0" step="any" disabled={disabled || source !== 'manual'} value={currentValid ? current : ''} onChange={(event) => updateGoal({ current: event.target.value === '' ? Number.NaN : Number(event.target.value) })} className="goal-target-number h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50 disabled:text-white/45" />
            </label>
          </div>
        </div>
      </div>
      {source !== 'manual' && <p className="mt-3 text-xs leading-5 text-white/45">Atualizado pelo CRM neste ciclo. Seu progresso manual fica guardado ao trocar a origem.</p>}
    </div>}
  </div>;
}
