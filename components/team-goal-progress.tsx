import type { GoalProgressByMetric } from '@/lib/metrics';

const metrics = [
  ['approaches', 'Abordagens'],
  ['interests', 'Interesses'],
  ['meetings', 'Reuniões e retornos'],
  ['sales', 'Vendas fechadas'],
  ['revenue', 'Receita de vendas'],
  ['mrr', 'MRR'],
  ['followUpsCompleted', 'Follow-ups concluídos'],
  ['conversionRate', 'Taxa de conversão']
] as const;

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });

function formatMetric(key: typeof metrics[number][0], value: number, hasApproaches: boolean) {
  if (key === 'conversionRate') return hasApproaches ? `${number.format(value)}%` : '—';
  if (key === 'revenue' || key === 'mrr') return money.format(value);
  return number.format(value);
}

export function TeamGoalProgress({ progress, hasApproaches, compact = false }: {
  progress: GoalProgressByMetric;
  hasApproaches: boolean;
  compact?: boolean;
}) {
  return <dl className={`grid ${compact ? 'gap-2' : 'gap-3'}`}>
    {metrics.map(([key, label]) => {
      const item = progress[key];
      const ratioPercent = item.ratio === null ? null : Math.round(item.ratio * 100);
      return <div className={`rounded-lg border border-white/10 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`} key={key}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <dt className="text-white/70">{label}</dt>
          <dd className="font-medium">{formatMetric(key, item.actual, hasApproaches)} <span className="text-white/40">/</span> {item.target === null ? <span className="text-white/45">Sem meta</span> : formatMetric(key, item.target, true)}</dd>
        </div>
        {item.target !== null ? <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Progresso: ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(ratioPercent ?? 0, 100)}>
            {ratioPercent !== null ? <div className="h-full rounded-full bg-[var(--atelier-green)]" style={{ width: `${Math.min(ratioPercent, 100)}%` }} /> : null}
          </div>
          <span className="min-w-12 text-right text-xs text-white/55">{ratioPercent === null ? '—' : `${ratioPercent}%`}</span>
        </div> : null}
      </div>;
    })}
  </dl>;
}
