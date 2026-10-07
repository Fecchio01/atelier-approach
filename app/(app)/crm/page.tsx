import { KanbanBoard, type CrmLead } from '@/components/kanban-board';
import { prisma } from '@/lib/db';
import { PageHeading } from '@/components/ui';
import { getFollowUpDelayDays } from '@/lib/commercial-settings';

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string; notice?: string }> }) {
  const { lead: focusedLeadId, notice } = await searchParams;
  const leads = await prisma.lead.findMany({
    include: {
      activities: { orderBy: { createdAt: 'desc' } },
      followUps: { orderBy: [{ state: 'asc' }, { dueDate: 'asc' }] }
    },
    orderBy: { id: 'desc' }
  });
  const services = await prisma.serviceCatalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const followUpDelayDays = await getFollowUpDelayDays();
  const serializedLeads: CrmLead[] = leads.map((lead) => ({
    ...lead,
    saleValue: lead.saleValue?.toString() ?? null,
    mrr: lead.mrr?.toString() ?? null,
    activities: lead.activities.map((activity) => ({ ...activity, createdAt: activity.createdAt.toISOString() })),
    followUps: lead.followUps.map((followUp) => ({ ...followUp, dueDate: followUp.dueDate.toISOString() }))
  }));

  return (
    <section className="mx-auto max-w-[1840px] px-5 py-7 md:px-8 md:py-9">
      <PageHeading eyebrow="CRM compartilhado" title="Seu funil, mais resultados." description="Acompanhe cada abordagem em uma visão única. Clique em uma empresa para abrir contatos, histórico e próxima ação." />
      {notice === 'duplicate' ? <p role="alert" className="mt-4 rounded-lg border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-white">Esta empresa já está no CRM.</p> : null}
      <div className="mt-8"><KanbanBoard leads={serializedLeads} focusedLeadId={focusedLeadId} services={services.map(({ id, name, price, billingType }) => ({ id, name, price: price.toString(), billingType }))} followUpDelayDays={followUpDelayDays} /></div>
    </section>
  );
}
