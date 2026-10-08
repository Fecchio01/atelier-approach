import type { GoalProgressByMetric } from '@/lib/metrics';
import { MotionProgressFill } from './motion-primitives';

const metrics = [
  ['approaches', 'Abordagens'],
  ['interests', 'Interesses'],
  ['meetings', 'Reuniões'],
  ['sales', 'Vendas fechadas'],
  ['revenue', 'Receita de vendas'],
  ['mrr', 'MRR'],
  ['followUpsCompleted', 'Follow-ups concluídos'],
  ['conversionRate', 'Taxa de conversão']
] as const;

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function formatMetric(key: typeof metrics[number][0], value: number, hasConversionRate: boolean) {
  if (key === 'conversionRate') return hasConversionRate ? `${number.format(value)}%` : '—';
  if (key === 'revenue' || key === 'mrr') return money.format(value);
  return number.format(value);
}

export function TeamGoalProgress({ progress, hasApproaches, compact = false }: {
  progress: GoalProgressByMetric;
  hasApproaches: boolean;
  compact?: boolean;
}) {
  return <div className={compact ? 'grid gap-0' : undefined}>
    {compact ? <div className="mb-1 hidden grid-cols-[minmax(0,1fr)_minmax(108px,0.95fr)_minmax(100px,0.9fr)] gap-4 border-b border-white/10 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45 sm:grid">
      <span>Indicador</span><span>Atual / meta</span><span>Progresso</span>
    </div> : null}
    <dl className={`grid ${compact ? 'gap-0' : 'gap-3'}`}>
      {metrics.map(([key, label]) => {
        const item = progress[key];
        const ratioPercent = item.ratio === null ? null : Math.round(item.ratio * 100);
        const hasConversionRate = hasApproaches || (key === 'conversionRate' && item.reported === true);
        return <div className={compact
          ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-white/[0.07] py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(108px,0.95fr)_minmax(100px,0.9fr)] sm:gap-4'
          : 'rounded-lg border border-white/10 px-4 py-3'} key={key}>
          <dt className={`text-sm ${compact ? 'text-white/75' : 'text-white/70'}`}>{label}</dt>
          <dd className={`whitespace-nowrap text-sm font-medium tabular-nums ${compact ? 'text-right sm:text-left' : ''}`}>{formatMetric(key, item.actual, hasConversionRate)} <span className="text-white/40">/</span> {item.target === null ? <span className="text-white/45">Sem meta</span> : formatMetric(key, item.target, true)}</dd>
          {item.target !== null ? <div className={`${compact ? 'col-span-2 sm:col-span-1 sm:col-start-3' : 'mt-2'} flex items-center gap-3`}>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Progresso: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(ratioPercent ?? 0, 100)}>
              {ratioPercent !== null ? <MotionProgressFill value={Math.min(ratioPercent, 100)} className="h-full origin-left rounded-full bg-[var(--atelier-green)]" /> : null}
            </div>
            <span className="min-w-10 text-right text-xs tabular-nums text-white/55">{ratioPercent === null ? '—' : `${ratioPercent}%`}</span>
          </div> : compact
            ? <span className="col-span-2 text-xs text-white/40 sm:col-span-1">Sem meta definida</span>
            : <div aria-hidden="true" className="mt-2 h-1.5 w-full rounded-full bg-white/10" />}
        </div>;
      })}
    </dl>
  </div>;
}
