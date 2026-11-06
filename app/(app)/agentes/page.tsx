import { PageHeading } from '@/components/ui';
import { AgentAutomationControl } from '@/components/agent-automation-control';
import { AgentNextActions } from '@/components/agent-next-actions';
import { AutonomousProspectingPanel, type AutonomousCampaign, type ProspectAnalysis } from '@/components/autonomous-prospecting-panel';
import { automationPolicy } from '@/lib/agents/policy';
import { prisma } from '@/lib/db';
import { analyzeProspect, getSaoPauloDateKey } from '@/lib/research/autonomous';
import { getCategoryCalibration } from '@/lib/research/feedback';

export default async function AgentsPage() {
  const [settings, activeCadences, waitingTasks, records] = await Promise.all([
    prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } }),
    prisma.cadenceEnrollment.count({ where: { status: { in: ['ACTIVE', 'WAITING_HUMAN'] } } }),
    prisma.crmTask.count({ where: { state: 'PENDING', effectKey: { startsWith: 'cadence:' } } }),
    prisma.researchCampaign.findMany({
      where: { ownerId: 'team', idempotencyKey: `autonomous:${getSaoPauloDateKey()}` },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: { candidates: { orderBy: { firstSeenAt: 'desc' }, take: 20, include: { candidate: { include: { evidence: { orderBy: { capturedAt: 'desc' }, take: 8 }, feedback: { select: { outcome: true, reason: true } } } } } } }
    })
  ]);
  const matchingLeads = await prisma.lead.findMany({
    where: { osmId: { in: records.flatMap((campaign) => campaign.candidates.map(({ candidate }) => candidate.externalId)) } },
    select: { id: true, osmId: true, discardedAt: true }
  });
  const categories = [...new Set(records.flatMap((campaign) => campaign.candidates.map(({ candidate }) => candidate.category).filter((value): value is string => Boolean(value?.trim()))))];
  const calibrations = new Map(await Promise.all(categories.map(async (category) => [category, await getCategoryCalibration(category)] as const)));
  const leadByExternalId = new Map(matchingLeads.map((lead) => [lead.osmId, lead]));
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
        leadId: candidate.leadId ?? leadByExternalId.get(candidate.externalId)?.id ?? null,
        leadIsDiscarded: Boolean(leadByExternalId.get(candidate.externalId)?.discardedAt),
        discardedAt: candidate.discardedAt?.toISOString() ?? null,
        feedbackReason: candidate.feedback?.outcome === 'DISCARDED' ? candidate.feedback.reason : null,
        calibrationHint: calibrations.get(candidate.category ?? '')?.label ?? null,
        name: candidate.name,
        status: candidate.status,
        category: candidate.category,
        address: candidate.address,
        phone: candidate.phone,
        website: candidate.website,
        instagram: candidate.instagram,
        whatsapp: candidate.whatsapp,
        imageUrl: candidate.imageUrl,
        commercialAnalysis: (() => {
          const analysis = analyzeProspect({
            niche: campaign.niche,
            name: candidate.name,
            category: candidate.category,
            address: candidate.address,
            phone: candidate.phone,
            website: candidate.website,
            instagram: candidate.instagram,
            whatsapp: candidate.whatsapp,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            status: candidate.status
          }) as unknown as ProspectAnalysis;
          const adjustment = calibrations.get(candidate.category ?? '')?.fitAdjustment ?? 0;
          const calibratedFit = Math.max(0, Math.min(100, analysis.fitScore + adjustment));
          return { ...analysis, fitScore: candidate.status === 'REVIEW_IDENTITY' ? Math.min(45, calibratedFit) : calibratedFit };
        })(),
        evidence: candidate.evidence.map(({ id, field, source, verified }) => ({ id, field, source, verified }))
      }
    }))
  }));

  return <section className="mx-auto max-w-[1520px] px-5 py-7 md:px-8 md:py-9">
    <PageHeading eyebrow="Agente autônomo" title="Pesquisa diária de empresas" description="O agente escolhe nichos e regiões, pesquisa empresas e apresenta a análise para a equipe." />
    <AgentNextActions />
    <div className="mt-6 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 text-sm text-white/65 sm:p-5">
      <p className="font-semibold text-white">Pesquisa programada todos os dias · análise sem custo de modelo</p>
      <p className="mt-1">As empresas são pesquisadas na fonte Overture e analisadas pelos dados coletados. O Darwin sugere próximos passos e prepara rascunhos; tarefas só são criadas após sua confirmação, e nenhuma mensagem ou etapa do funil é alterada automaticamente.</p>
      <p className="mt-2 text-xs text-white/45">Política {automationPolicy.version} · até {automationPolicy.maxRunsPerMemberPerDay} análises por membro/dia</p>
    </div>
    <AgentAutomationControl initiallyPaused={settings?.paused ?? false} activeCadences={activeCadences} waitingTasks={waitingTasks} />
    <AutonomousProspectingPanel initialCampaigns={campaigns} dailyLimit={settings?.prospectingDailyLimit ?? 10} enabled={settings?.prospectingEnabled ?? true} paused={settings?.paused ?? false} />
  </section>;
}
