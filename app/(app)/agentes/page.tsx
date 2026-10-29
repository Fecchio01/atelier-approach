import { PageHeading } from '@/components/ui';
import { AgentAutomationControl } from '@/components/agent-automation-control';
import { AutonomousProspectingPanel, type AutonomousCampaign, type ProspectAnalysis } from '@/components/autonomous-prospecting-panel';
import { automationPolicy } from '@/lib/agents/policy';
import { prisma } from '@/lib/db';

export default async function AgentsPage() {
  const [settings, activeCadences, waitingTasks, records] = await Promise.all([
    prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } }),
    prisma.cadenceEnrollment.count({ where: { status: { in: ['ACTIVE', 'WAITING_HUMAN'] } } }),
    prisma.crmTask.count({ where: { state: 'PENDING', effectKey: { startsWith: 'cadence:' } } }),
    prisma.researchCampaign.findMany({
      where: { ownerId: 'team', idempotencyKey: { startsWith: 'autonomous:' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { candidates: { orderBy: { firstSeenAt: 'desc' }, take: 20, include: { candidate: { include: { evidence: { orderBy: { capturedAt: 'desc' }, take: 8 } } } } } }
    })
  ]);
  const campaigns: AutonomousCampaign[] = records.map((campaign) => ({
    id: campaign.id,
    idempotencyKey: campaign.idempotencyKey,
    name: campaign.name,
    niche: campaign.niche,
    region: campaign.region,
    city: campaign.city,
    status: campaign.status,
    maxCandidates: campaign.maxCandidates,
    candidateCount: campaign.candidateCount,
    maxAreas: campaign.maxAreas,
    completedAreas: campaign.completedAreas,
    error: campaign.error,
    createdAt: campaign.createdAt.toISOString(),
    candidates: campaign.candidates.map(({ candidate, firstSeenAt }) => ({
      firstSeenAt: firstSeenAt.toISOString(),
      candidate: {
        id: candidate.id,
        name: candidate.name,
        status: candidate.status,
        category: candidate.category,
        address: candidate.address,
        phone: candidate.phone,
        website: candidate.website,
        instagram: candidate.instagram,
        whatsapp: candidate.whatsapp,
        imageUrl: candidate.imageUrl,
        commercialAnalysis: candidate.commercialAnalysis as unknown as ProspectAnalysis | null,
        evidence: candidate.evidence.map(({ id, field, source, verified }) => ({ id, field, source, verified }))
      }
    }))
  }));

  return <section className="mx-auto max-w-[1520px] px-5 py-7 md:px-8 md:py-9">
    <PageHeading eyebrow="Agente autônomo" title="Pesquisa diária de empresas" description="O agente escolhe nichos e regiões, pesquisa empresas e apresenta a análise para a equipe." />
    <div className="mt-6 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 text-sm text-white/65 sm:p-5">
      <p className="font-semibold text-white">Pesquisa programada todos os dias · análise sem custo de modelo</p>
      <p className="mt-1">As empresas são pesquisadas na fonte Overture e analisadas automaticamente pelos dados coletados. O agente não cria abordagens, não muda etapas do funil e não envia mensagens.</p>
      <p className="mt-2 text-xs text-white/45">Política {automationPolicy.version} · até {automationPolicy.maxRunsPerMemberPerDay} análises por membro/dia</p>
    </div>
    <AgentAutomationControl initiallyPaused={settings?.paused ?? false} activeCadences={activeCadences} waitingTasks={waitingTasks} />
    <AutonomousProspectingPanel initialCampaigns={campaigns} dailyLimit={settings?.prospectingDailyLimit ?? 10} enabled={settings?.prospectingEnabled ?? true} paused={settings?.paused ?? false} />
  </section>;
}
