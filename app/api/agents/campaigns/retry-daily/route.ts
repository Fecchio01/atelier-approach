import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { countVisibleCampaignCandidates } from '@/lib/research/candidates';
import { getSaoPauloDateKey } from '@/lib/research/autonomous';
import { resolveProspectSearchPlan } from '@/lib/research/search-service';
import { startProspectingCampaign } from '@/lib/research/runtime';

export const runtime = 'nodejs';

const MAX_AREAS = 64;
const MAX_TOTAL_ATTEMPTS = 3;
const DISPATCH_LEASE_MS = 60_000;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Entre no sistema para tentar novamente.' }, { status: 401 });

  const campaign = await prisma.researchCampaign.findUnique({
    where: { idempotencyKey: `autonomous:${getSaoPauloDateKey()}` }
  });
  if (!campaign || campaign.ownerId !== 'team') {
    return Response.json({ error: 'Ainda não há pesquisa de hoje para retomar.' }, { status: 404 });
  }
  if (campaign.status !== 'COMPLETED') {
    return Response.json({ error: 'A pesquisa só pode ser ampliada depois de concluir.' }, { status: 409 });
  }
  const availableCount = await countVisibleCampaignCandidates(prisma, campaign.id);
  if (availableCount >= campaign.maxCandidates) {
    return Response.json({ error: 'A pesquisa já encontrou o limite de empresas disponíveis.' }, { status: 409 });
  }
  const checkpoint = campaign.checkpoint && typeof campaign.checkpoint === 'object' && !Array.isArray(campaign.checkpoint)
    ? campaign.checkpoint as { retryUsed?: unknown; retryCount?: unknown }
    : {};
  const retryCount = typeof checkpoint.retryCount === 'number' && Number.isInteger(checkpoint.retryCount)
    ? checkpoint.retryCount
    : checkpoint.retryUsed === true ? 1 : 0;
  if (retryCount >= MAX_TOTAL_ATTEMPTS - 1) {
    return Response.json({ error: 'As tentativas de ampliação da pesquisa de hoje foram usadas.' }, { status: 409 });
  }

  let plan;
  try {
    plan = await resolveProspectSearchPlan({ region: campaign.region, city: campaign.city ?? undefined, maxAreas: 8 });
  } catch {
    return Response.json({ error: 'Não consegui preparar novas áreas de pesquisa agora.' }, { status: 503 });
  }
  if (!plan.areas.length) return Response.json({ error: 'Não encontrei áreas válidas para tentar novamente.' }, { status: 422 });

  const claimed = await prisma.researchCampaign.updateMany({
    where: { id: campaign.id, status: 'COMPLETED', checkpointVersion: campaign.checkpointVersion },
    data: {
      status: 'RUNNING',
      error: null,
      workflowRunId: null,
      candidateCount: availableCount,
      dispatchLeaseUntil: new Date(Date.now() + DISPATCH_LEASE_MS),
      dispatchAttemptedAt: new Date(),
      completedAreas: 0,
      maxAreas: MAX_AREAS,
      checkpoint: { areas: plan.areas, retryUsed: true, retryCount: retryCount + 1 },
      checkpointVersion: { increment: 1 },
      release: plan.release
    }
  });
  if (!claimed.count) return Response.json({ error: 'A pesquisa já está sendo retomada.' }, { status: 409 });

  try {
    const workflow = await startProspectingCampaign(campaign.id);
    try {
      await prisma.researchCampaign.update({ where: { id: campaign.id }, data: { workflowRunId: workflow.runId, dispatchAttemptedAt: null, dispatchLeaseUntil: null } });
    } catch (error) {
      console.error('[agents/campaigns/retry-daily] Workflow started but run id could not be persisted', {
        campaignId: campaign.id,
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
      });
      return Response.json({ campaignId: campaign.id, status: 'RUNNING' }, { status: 202 });
    }
    return Response.json({ campaignId: campaign.id, status: 'RUNNING' }, { status: 202 });
  } catch (error) {
    console.error('[agents/campaigns/retry-daily] Could not restart campaign', {
      campaignId: campaign.id,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING', workflowRunId: null },
      data: { status: 'FAILED', error: 'Não consegui iniciar a nova tentativa. Atualize a página e tente novamente amanhã.', dispatchLeaseUntil: null, dispatchAttemptedAt: null }
    });
    return Response.json({ error: 'Não consegui iniciar a nova tentativa.' }, { status: 503 });
  }
}
