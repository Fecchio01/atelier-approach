import { prisma } from '@/lib/db';
import { countVisibleCampaignCandidates } from '@/lib/research/candidates';
import { AUTONOMOUS_NATIONAL_AREA_QUERIES, AUTONOMOUS_NATIONAL_BASE_AREA_QUERIES, AUTONOMOUS_NATIONAL_SEARCH_VERSION, getSaoPauloDateKey } from '@/lib/research/autonomous';
import { resolveProspectSearchPlan } from '@/lib/research/search-service';
import { startProspectingCampaign } from '@/lib/research/runtime';

const DISPATCH_LEASE_MS = 60_000;

export async function resumeIncompleteDailyCampaign() {
  const settings = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } });
  if (settings?.paused || settings?.prospectingEnabled === false) return { resumed: false, reason: 'paused' };

  const campaign = await prisma.researchCampaign.findUnique({
    where: { idempotencyKey: `autonomous:${getSaoPauloDateKey()}` }
  });
  if (!campaign || campaign.status !== 'COMPLETED') return { resumed: false, reason: 'not_completed' };

  const availableCount = await countVisibleCampaignCandidates(prisma, campaign.id);
  if (availableCount >= campaign.maxCandidates) {
    if (campaign.candidateCount !== availableCount || campaign.error) {
      await prisma.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'COMPLETED', checkpointVersion: campaign.checkpointVersion },
        data: { candidateCount: availableCount, error: null }
      });
    }
    return { resumed: false, reason: 'batch_ready' };
  }

  const checkpoint = campaign.checkpoint && typeof campaign.checkpoint === 'object' && !Array.isArray(campaign.checkpoint)
    ? campaign.checkpoint as { nationalFallbackUsed?: unknown; nationalSearchVersion?: unknown }
    : {};
  if (checkpoint.nationalFallbackUsed === true && checkpoint.nationalSearchVersion === AUTONOMOUS_NATIONAL_SEARCH_VERSION) {
    return { resumed: false, reason: 'national_search_exhausted', availableCount };
  }

  const plan = await resolveProspectSearchPlan({
    region: campaign.region,
    national: true,
    maxAreas: AUTONOMOUS_NATIONAL_BASE_AREA_QUERIES
  });
  if (!plan.areas.length) return { resumed: false, reason: 'no_search_areas', availableCount };

  const resumed = await prisma.researchCampaign.updateMany({
    where: { id: campaign.id, status: 'COMPLETED', checkpointVersion: campaign.checkpointVersion },
    data: {
      status: 'QUEUED',
      error: null,
      workflowRunId: null,
      dispatchLeaseUntil: null,
      dispatchAttemptedAt: null,
      maxAreas: campaign.completedAreas + AUTONOMOUS_NATIONAL_AREA_QUERIES,
      checkpoint: {
        areas: plan.areas,
        nationalFallbackUsed: true,
        nationalSearchVersion: AUTONOMOUS_NATIONAL_SEARCH_VERSION,
        ...(plan.areaPlanTruncated ? { nationalCoverageLimitReached: true } : {})
      },
      checkpointVersion: { increment: 1 },
      candidateCount: availableCount,
      release: plan.release
    }
  });
  if (!resumed.count) return { resumed: false, reason: 'resume_already_claimed' };

  const now = new Date();
  const lease = await prisma.researchCampaign.updateMany({
    where: { id: campaign.id, status: 'QUEUED', workflowRunId: null, OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lt: now } }] },
    data: { status: 'RUNNING', dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS), dispatchAttemptedAt: now }
  });
  if (!lease.count) return { resumed: false, reason: 'dispatch_already_claimed' };

  try {
    const workflow = await startProspectingCampaign(campaign.id);
    await prisma.researchCampaign.update({
      where: { id: campaign.id },
      data: { workflowRunId: workflow.runId, dispatchLeaseUntil: null, dispatchAttemptedAt: null }
    });
    return { resumed: true, campaignId: campaign.id, workflowRunId: workflow.runId, availableCount };
  } catch (error) {
    console.error('[agents/campaigns] Could not resume incomplete daily campaign', { campaignId: campaign.id, error });
    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING', workflowRunId: null },
      data: { status: 'FAILED', dispatchLeaseUntil: null, dispatchAttemptedAt: null, error: 'A pesquisa diária será retomada na próxima execução automática.' }
    });
    return { resumed: false, reason: 'dispatch_failed' };
  }
}
