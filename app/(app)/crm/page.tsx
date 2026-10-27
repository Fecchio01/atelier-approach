import { KanbanBoard, type CrmLead } from '@/components/kanban-board';
import { prisma } from '@/lib/db';
import { PageHeading } from '@/components/ui';
import { getFollowUpDelayDays } from '@/lib/commercial-settings';
import { getCrmBoardLeads } from '@/lib/crm-board';
import { processCrmLifecycleForPageRequest } from '@/lib/crm-lifecycle-page-request';
import { getCrmBoardVersion } from '@/lib/crm-board-version';
import { getCurrentUser } from '@/lib/auth';

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string; notice?: string }> }) {
  const { lead: focusedLeadId, notice } = await searchParams;
  await processCrmLifecycleForPageRequest();
  const [leads, services, followUpDelayDays, boardVersion, members, user] = await Promise.all([getCrmBoardLeads(),
  prisma.serviceCatalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  getFollowUpDelayDays(), getCrmBoardVersion(),
  prisma.memberProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  getCurrentUser()]);
  const teamMembers = user && !members.some(({ id }) => id === user.id)
    ? [...members, { id: user.id, name: user.name || user.email || 'Membro atual' }].sort((a, b) => a.name.localeCompare(b.name))
    : members;
  const serializedLeads: CrmLead[] = leads.map((lead) => ({
    ...lead,
    saleValue: lead.saleValue?.toString() ?? null,
    mrr: lead.mrr?.toString() ?? null,
    stageEnteredAt: lead.stageEnteredAt.toISOString(),
    lastMeaningfulInteractionAt: lead.lastMeaningfulInteractionAt?.toISOString() ?? null,
    nextActionAt: lead.nextActionAt?.toISOString() ?? null,
    meetingAt: lead.meetingAt?.toISOString() ?? null,
    postFollowUpAt: lead.postFollowUpAt?.toISOString() ?? null,
    discardedAt: lead.discardedAt?.toISOString() ?? null,
    followUpOriginStage: lead.followUpOriginStage,
    activities: lead.activities.map((activity) => ({ ...activity, createdAt: activity.createdAt.toISOString() })),
    followUps: [],
    detailsLoaded: false
  }));

  return (
    <section className="mx-auto max-w-[1840px] px-5 py-7 md:px-8 md:py-9">
      <PageHeading eyebrow="CRM compartilhado" title="Seu funil, mais resultados." description="Acompanhe cada abordagem em uma visão única. Clique em uma empresa para abrir contatos, histórico e próxima ação." />
      {notice === 'duplicate' ? <p role="alert" className="mt-4 rounded-lg border border-[var(--atelier-green)]/50 bg-[var(--atelier-green)]/10 px-4 py-3 text-sm text-white">Esta empresa já está no CRM.</p> : null}
      <div className="mt-8"><KanbanBoard leads={serializedLeads} focusedLeadId={focusedLeadId} services={services.map(({ id, name, price, billingType }) => ({ id, name, price: price.toString(), billingType }))} followUpDelayDays={followUpDelayDays} boardVersion={boardVersion} members={teamMembers} currentMemberId={user?.id} /></div>
    </section>
  );
}
