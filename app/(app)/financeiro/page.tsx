import type { ReactNode } from 'react';
import { ChartLineUpIcon, CurrencyDollarIcon, HandCoinsIcon, ReceiptIcon } from '@phosphor-icons/react/dist/ssr';
import { PageHeading } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getGoalPeriodWindow } from '@/lib/goal-periods';

export const dynamic = 'force-dynamic';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const monthLabel = (date: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).format(date).replace('.', '');

export default async function FinancePage() {
  const now = new Date();
  const settings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' }, select: { monthlyStartDay: true } });
  const startDay = settings?.monthlyStartDay ?? 1;
  const windows = [];
  let cursor = getGoalPeriodWindow('MONTHLY', now, startDay);
  windows.unshift(cursor);
  for (let index = 0; index < 5; index += 1) {
    cursor = getGoalPeriodWindow('MONTHLY', new Date(cursor.start.getTime() - 1), startDay);
    windows.unshift(cursor);
  }
  const [periodTotals, allMrr, latestSales] = await Promise.all([
    Promise.all(windows.map(async (window) => {
      const aggregate = await prisma.saleEvent.aggregate({
        where: { occurredAt: { gte: window.start, lt: window.end }, reversedAt: null },
        _count: { _all: true }, _sum: { saleValue: true, mrr: true }
      });
      return { start: window.start, count: aggregate._count._all, sales: Number(aggregate._sum.saleValue ?? 0), mrr: Number(aggregate._sum.mrr ?? 0) };
    })),
    prisma.saleEvent.aggregate({ where: { occurredAt: { lt: now }, reversedAt: null }, _sum: { mrr: true } }),
    prisma.saleEvent.findMany({
      where: { occurredAt: { gte: windows.at(-1)!.start, lt: now }, reversedAt: null },
      select: { id: true, saleValue: true, mrr: true, occurredAt: true, lead: { select: { name: true } } },
      orderBy: { occurredAt: 'desc' }, take: 12
    })
  ]);
  const current = periodTotals.at(-1)!;
  const contractedMrr = Number(allMrr._sum.mrr ?? 0);
  const averageTicket = current.count ? current.sales / current.count : 0;
  const maxSales = Math.max(1, ...periodTotals.map((period) => period.sales));

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5 md:px-8 md:py-10">
    <PageHeading eyebrow="Visão financeira" title="Faturamento registrado" description="Acompanhe vendas e MRR informados ao fechar negócios no CRM. Estes valores representam contratos registrados, não recebimentos ou fluxo de caixa." />
    <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<CurrencyDollarIcon size={18} />} label="Vendas no ciclo" value={money(current.sales)} detail={`${current.count} negócio${current.count === 1 ? '' : 's'} fechado${current.count === 1 ? '' : 's'}`} />
      <Metric icon={<HandCoinsIcon size={18} />} label="MRR vendido no ciclo" value={money(current.mrr)} detail="MRR dos negócios deste ciclo" />
      <Metric icon={<ChartLineUpIcon size={18} />} label="MRR em negócios ganhos" value={money(contractedMrr)} detail="Histórico dos eventos não estornados" />
      <Metric icon={<ReceiptIcon size={18} />} label="Ticket médio do ciclo" value={money(averageTicket)} detail="Valor de venda ÷ negócios fechados" />
    </div>

    <section className="mt-5 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 sm:p-6" aria-labelledby="finance-chart-title">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="finance-chart-title" className="text-lg font-semibold">Vendas por ciclo</h2><p className="mt-1 text-sm text-white/50">Últimos seis ciclos mensais configurados</p></div><span className="text-xs text-white/45">Receita vendida</span></div>
      <div className="mt-6 grid grid-cols-6 items-end gap-2 sm:gap-4">
        {periodTotals.map((period) => <div key={period.start.toISOString()} className="flex min-w-0 flex-col items-center gap-2">
          <span className="max-w-full truncate text-center text-[10px] text-white/55 sm:text-xs">{money(period.sales)}</span>
          <div className="flex h-36 w-full items-end rounded-t-md bg-white/[0.035] sm:h-44"><div title={money(period.sales)} className="w-full rounded-t-md bg-[var(--atelier-green)] transition-[height] duration-300 motion-reduce:transition-none" style={{ height: `${period.sales ? Math.max(5, period.sales / maxSales * 100) : 0}%` }} /></div>
          <span className="text-xs capitalize text-white/55">{monthLabel(period.start)}</span>
        </div>)}
      </div>
    </section>

    <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)]" aria-labelledby="finance-sales-title">
      <div className="border-b border-white/[0.08] px-4 py-4 sm:px-6"><h2 id="finance-sales-title" className="font-semibold">Negócios fechados neste ciclo</h2><p className="mt-1 text-sm text-white/50">Valores registrados no fechamento dentro do CRM.</p></div>
      {latestSales.length ? <ul className="divide-y divide-white/[0.07]">
        {latestSales.map((event) => <li key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5 sm:px-6">
          <span className="truncate text-sm font-medium">{event.lead.name?.trim() || 'Empresa sem nome'}</span>
          <span className="text-xs text-white/45">{new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'medium' }).format(event.occurredAt)}</span>
          <span className="text-sm tabular-nums">{money(Number(event.saleValue))}<span className="ml-2 text-xs text-white/45">MRR {money(Number(event.mrr))}</span></span>
        </li>)}
      </ul> : <p className="px-4 py-8 text-sm text-white/50 sm:px-6">Ainda não há vendas registradas neste ciclo.</p>}
    </section>
    <p className="mt-4 text-xs leading-5 text-white/40">Somente vendas registradas no CRM entram nestes valores. Recebimentos, inadimplência, impostos e custos não são calculados pelo sistema.</p>
  </main>;
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <section className="rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4" aria-label={label}>
    <div className="flex items-center gap-2 text-[var(--atelier-green)]">{icon}<span className="text-xs font-medium text-white/55">{label}</span></div>
    <p className="mt-4 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p><p className="mt-1 text-xs text-white/45">{detail}</p>
  </section>;
}
