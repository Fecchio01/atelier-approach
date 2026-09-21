import { KanbanBoard, type CrmLead } from '@/components/kanban-board';
import { prisma } from '@/lib/db';
import { PageHeading } from '@/components/ui';

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
      <PageHeading eyebrow="CRM compartilhado" title="Todas as abordagens em um só lugar." description="A equipe vê a etapa e a última interação de cada empresa. Clique em um card para abrir os detalhes e operar o lead." />
      {notice === 'duplicate' ? <p role="alert" className="mt-4 rounded-lg border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-white">Esta empresa já está no CRM.</p> : null}
      <div className="mt-8"><KanbanBoard leads={serializedLeads} focusedLeadId={focusedLeadId} /></div>
    </section>
  );
}
