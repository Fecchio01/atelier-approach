'use client';

import {
  CalendarBlankIcon, CarProfileIcon, ChartLineUpIcon, CheckSquareOffsetIcon,
  CurrencyDollarIcon, HandshakeIcon, PlusIcon, StarIcon, TargetIcon,
  TrashIcon, TrophyIcon, UsersThreeIcon, WrenchIcon
} from '@phosphor-icons/react';

import { customGoalIcons, type CustomGoalIcon, type CustomGoalMetric } from '@/lib/custom-goals';

const iconDetails: Record<CustomGoalIcon, { label: string; Icon: typeof TargetIcon }> = {
  target: { label: 'Alvo', Icon: TargetIcon },
  car: { label: 'Carro', Icon: CarProfileIcon },
  users: { label: 'Pessoas', Icon: UsersThreeIcon },
  currency: { label: 'Receita', Icon: CurrencyDollarIcon },
  chart: { label: 'Gráfico', Icon: ChartLineUpIcon },
  checklist: { label: 'Lista', Icon: CheckSquareOffsetIcon },
  star: { label: 'Estrela', Icon: StarIcon },
  handshake: { label: 'Acordo', Icon: HandshakeIcon },
  calendar: { label: 'Calendário', Icon: CalendarBlankIcon },
  wrench: { label: 'Ferramenta', Icon: WrenchIcon },
  trophy: { label: 'Troféu', Icon: TrophyIcon }
};

function formatValue(value: number, unit?: string) {
  if (!Number.isFinite(value)) return '—';
  const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  return unit === 'R$' ? `R$ ${formatted}` : `${formatted}${unit ? ` ${unit}` : ''}`;
}

export function CustomGoalMetrics({
  goals,
  onChange
}: {
  goals: CustomGoalMetric[];
  onChange: (goals: CustomGoalMetric[]) => void;
}) {
  function updateGoal(id: string, changes: Partial<CustomGoalMetric>) {
    onChange(goals.map((goal) => goal.id === id ? { ...goal, ...changes } : goal));
  }

  function addGoal() {
    onChange([...goals, { id: crypto.randomUUID(), name: '', target: 1, current: 0, icon: 'target' }]);
  }

  return <section aria-labelledby="custom-goals-heading" className="rounded-2xl border border-white/[0.08] bg-[#11171b]/85 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
      <div>
        <h3 id="custom-goals-heading" className="font-semibold text-white/90">Indicadores personalizados</h3>
        <p className="mt-1 text-xs leading-5 text-white/45">Crie outros marcos e atualize o progresso manualmente neste ciclo.</p>
      </div>
      <button type="button" onClick={addGoal} disabled={goals.length >= 30} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--atelier-green)]/35 px-3 py-2 text-xs font-semibold text-[var(--atelier-green)] transition hover:bg-[var(--atelier-green)]/[0.08] disabled:opacity-40">
        <PlusIcon size={15} aria-hidden="true" /> Adicionar indicador
      </button>
    </div>

    {goals.length === 0 ? <p className="py-5 text-sm text-white/45">Nenhum indicador personalizado neste ciclo.</p> : <div className="grid gap-3 pt-4 lg:grid-cols-2">
      {goals.map((goal, index) => {
        const icon = goal.icon && customGoalIcons.includes(goal.icon) ? goal.icon : 'target';
        const { Icon } = iconDetails[icon];
        const targetValid = Number.isFinite(goal.target) && goal.target > 0;
        const currentValid = Number.isFinite(goal.current) && goal.current >= 0;
        const percent = targetValid && currentValid ? Math.min(100, Math.max(0, Math.round(goal.current / goal.target * 100))) : 0;

        return <article key={goal.id} className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]"><Icon size={18} aria-hidden="true" /></span>
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_132px]">
              <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
                Nome do indicador
                <input aria-label={`Nome do indicador ${index + 1}`} maxLength={80} value={goal.name} onChange={(event) => updateGoal(goal.id, { name: event.target.value })} placeholder="Ex.: Carros entregues" className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm font-medium text-white outline-none focus:border-[var(--atelier-green)]/50" />
              </label>
              <label className="grid gap-1 text-[11px] text-white/45">
                Ícone
                <select aria-label={`Ícone do indicador ${index + 1}`} value={icon} onChange={(event) => updateGoal(goal.id, { icon: event.target.value as CustomGoalIcon })} className="h-9 w-full rounded-md border border-white/[0.09] bg-[#171e22] px-2 text-xs text-white outline-none focus:border-[var(--atelier-green)]/50">
                  {customGoalIcons.map((key) => <option key={key} value={key}>{iconDetails[key].label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-[11px] text-white/45">
                Unidade (opcional)
                <input aria-label={`Unidade do indicador ${index + 1}`} maxLength={24} value={goal.unit ?? ''} onChange={(event) => updateGoal(goal.id, { unit: event.target.value })} placeholder="unidades, R$, %" className="h-9 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
                  Meta
                  <input aria-label={`Meta do indicador ${index + 1}`} type="number" inputMode="decimal" min="0.01" step="any" value={targetValid ? goal.target : ''} onChange={(event) => updateGoal(goal.id, { target: event.target.value === '' ? Number.NaN : Number(event.target.value) })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] text-white/45">
                  Progresso
                  <input aria-label={`Progresso do indicador ${index + 1}`} type="number" inputMode="decimal" min="0" step="any" value={currentValid ? goal.current : ''} onChange={(event) => updateGoal(goal.id, { current: event.target.value === '' ? Number.NaN : Number(event.target.value) })} className="h-9 min-w-0 rounded-md border border-white/[0.09] bg-[#171e22] px-2.5 text-sm text-white outline-none focus:border-[var(--atelier-green)]/50" />
                </label>
              </div>
            </div>
            <button type="button" aria-label={`Remover ${goal.name || `indicador ${index + 1}`}`} onClick={() => onChange(goals.filter((item) => item.id !== goal.id))} className="mt-5 flex size-8 shrink-0 items-center justify-center rounded-md text-white/40 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300">
              <TrashIcon size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div role="progressbar" aria-label={`Progresso de ${goal.name || `indicador ${index + 1}`}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.12]">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#81e986] to-[var(--atelier-green)] transition-[width] duration-300" style={{ width: `${percent}%` }} />
            </div>
            <span className="w-28 shrink-0 text-right text-xs tabular-nums text-white/55">{formatValue(goal.current, goal.unit)} / {formatValue(goal.target, goal.unit)}</span>
            <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/45">{percent}%</span>
          </div>
        </article>;
      })}
    </div>}
  </section>;
}
