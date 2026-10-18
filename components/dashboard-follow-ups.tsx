import Link from 'next/link';
import { ArrowRightIcon, CalendarCheckIcon, CheckCircleIcon } from '@phosphor-icons/react/dist/ssr';

import type { MetricFollowUp } from '@/lib/metrics';

const visibleLimit = 3;

function shortDate(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(value);
}

export function DashboardFollowUps({ followUps, empty, nameFor, overdue = false, upcoming = false }: {
  followUps: MetricFollowUp[];
  empty: string;
  nameFor: (id: string) => string;
  overdue?: boolean;
  upcoming?: boolean;
}) {
  const renderFollowUp = (followUp: MetricFollowUp) => {
    const companyName = followUp.lead?.name ?? 'Lead sem nome';
    const details = <>
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${overdue ? 'bg-rose-300/10 text-rose-300' : 'bg-[var(--atelier-green)]/[0.08] text-[var(--atelier-green)]'}`}>
        {overdue ? <CalendarCheckIcon size={17} weight="regular" aria-hidden="true" /> : <CheckCircleIcon size={17} weight="regular" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate font-medium text-white">{companyName}</strong>
        <span className="mt-1 block text-xs text-white/55">{nameFor(followUp.ownerId)} · {overdue ? `Vencido em ${shortDate(followUp.dueDate)}` : upcoming ? `Retorno em ${shortDate(followUp.dueDate)}` : 'Retorno previsto para hoje'}</span>
      </span>
      <ArrowRightIcon className="mt-2 shrink-0 text-white/35" size={15} aria-hidden="true" />
    </>;

    return <li key={followUp.id ?? `${followUp.lead?.id}-${followUp.dueDate.toISOString()}`} className="text-sm">
      {followUp.lead?.id ? <Link href={`/crm?lead=${encodeURIComponent(followUp.lead.id)}`} aria-label={`Abrir ${companyName} no CRM`} className="group flex items-start gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]">
        {details}
      </Link> : <div className="flex items-start gap-3 py-3">{details}</div>}
    </li>;
  };

  const visibleFollowUps = followUps.slice(0, visibleLimit);
  const remainingFollowUps = followUps.slice(visibleLimit);

  return <ul className="mt-2 flex flex-1 flex-col divide-y divide-white/[0.07]">
    {followUps.length ? <>
      {visibleFollowUps.map(renderFollowUp)}
      {remainingFollowUps.length > 0 && <li className="py-2">
        <details>
          <summary className="cursor-pointer list-none text-xs font-medium text-[var(--atelier-green)] outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--atelier-green)]">
            Ver mais {remainingFollowUps.length} {remainingFollowUps.length === 1 ? 'empresa' : 'empresas'}
          </summary>
          <ul className="mt-1 divide-y divide-white/[0.07]">{remainingFollowUps.map(renderFollowUp)}</ul>
        </details>
      </li>}
    </> : <li className="flex flex-1 items-center py-3 text-sm text-white/50">{empty}</li>}
  </ul>;
}
