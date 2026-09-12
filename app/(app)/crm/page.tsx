import { KanbanBoard, type CrmLead } from '@/components/kanban-board';
import { prisma } from '@/lib/db';

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string; notice?: string }> }) {
  const { lead: focusedLeadId, notice } = await searchParams;
  const leads = await prisma.lead.findMany({
    include: {
      activities: { orderBy: { createdAt: 'desc' } },
      followUps: { orderBy: [{ state: 'asc' }, { dueDate: 'asc' }] }
    },
    orderBy: { id: 'desc' }
  });
  const serializedLeads: CrmLead[] = leads.map((lead) => ({
    ...lead,
    saleValue: lead.saleValue?.toString() ?? null,
    mrr: lead.mrr?.toString() ?? null,
    activities: lead.activities.map((activity) => ({ ...activity, createdAt: activity.createdAt.toISOString() })),
    followUps: lead.followUps.map((followUp) => ({ ...followUp, dueDate: followUp.dueDate.toISOString() }))
  }));

  return (
    <section className="mx-auto max-w-[1800px] px-5 py-12 md:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--atelier-green)]">CRM compartilhado</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Todas as abordagens, em uma fila da equipe.</h1>
      <p className="mt-2 text-white/65">As movimentações e atividades ficam visíveis para todas as pessoas autenticadas.</p>
      {notice === 'duplicate' ? <p role="alert" className="mt-4 rounded-lg border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-white">Esta empresa já está no CRM.</p> : null}
      <div className="mt-8"><KanbanBoard leads={serializedLeads} focusedLeadId={focusedLeadId} /></div>
    </section>
  );
}
