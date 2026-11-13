import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { AUTONOMOUS_CAMPAIGN_OWNER_ID, AUTONOMOUS_MAX_AREA_QUERIES, AUTONOMOUS_NATIONAL_AREA_QUERIES, AUTONOMOUS_NATIONAL_BASE_AREA_QUERIES, AUTONOMOUS_NATIONAL_SEARCH_VERSION, chooseDailyProspectingTarget, getSaoPauloDateKey } from '@/lib/research/autonomous';
import { resolveProspectSearchPlan } from '@/lib/research/search-service';
import { countVisibleCampaignCandidates } from '@/lib/research/candidates';
import { startProspectingCampaign } from '@/lib/research/runtime';

const INITIAL_AREAS = 8;
const DISPATCH_LEASE_MS = 60_000;
const DISPATCH_RETRY_BACKOFF_MS = 60 * 60_000;
const MAX_DISPATCH_RETRIES = 3;

function getSaoPauloHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
}

function changedAfterScheduledTime(dateKey: string, scheduledTime: string, changedAt: Date | null | undefined) {
  if (!changedAt || getSaoPauloDateKey(changedAt) !== dateKey) return false;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(changedAt);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '00';
  const changedTime = `${part('hour')}:${part('minute')}:${part('second')}`;
  return changedTime >= `${scheduledTime}:00`;
}

export async function runAutonomousProspecting(request: Request, expectedHour?: number) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } });
    if (settings?.paused || settings?.prospectingEnabled === false) {
      return Response.json({ skipped: true, reason: settings?.paused ? 'automation_paused' : 'research_disabled' });
    }

    let configuredTime: string | null = null;
    let currentHour: number | null = null;
    if (expectedHour !== undefined) {
      currentHour = getSaoPauloHour();
      configuredTime = settings?.prospectingTime ?? '09:00';
      const configuredHour = Number(configuredTime.slice(0, 2));
      if (expectedHour < configuredHour) return Response.json({ skipped: true, reason: 'before_configured_time' });
    }

    const dateKey = getSaoPauloDateKey();
    const idempotencyKey = `autonomous:${dateKey}`;
    let campaign = await prisma.researchCampaign.findUnique({ where: { idempotencyKey } });
    if (expectedHour !== undefined && currentHour !== expectedHour) {
      const configuredHour = Number((configuredTime ?? '09:00').slice(0, 2));
      const retryWindowOpen = currentHour !== null && currentHour >= configuredHour;
      const recoverableDispatch = retryWindowOpen && campaign && (
        campaign.status === 'FAILED'
        || (campaign.status === 'RUNNING' && !campaign.workflowRunId && campaign.dispatchAttemptedAt
          && campaign.dispatchAttemptedAt.getTime() + DISPATCH_LEASE_MS <= Date.now())
      );
      if (!recoverableDispatch) return Response.json({ skipped: true, reason: 'outside_scheduled_hour' });
    }
    const configuredHour = Number((configuredTime ?? '09:00').slice(0, 2));
    if (expectedHour !== undefined && expectedHour >= configuredHour && !campaign
      && changedAfterScheduledTime(dateKey, configuredTime ?? '09:00', settings?.prospectingTimeUpdatedAt)) {
      return Response.json({ skipped: true, reason: 'schedule_was_changed_after_its_window' });
    }
    if (!campaign) {
      const target = chooseDailyProspectingTarget(dateKey, settings?.prospectingNiches ?? []);
      const plan = await resolveProspectSearchPlan({ region: target.region, city: target.city, maxAreas: INITIAL_AREAS });
      if (!plan.areas.length) throw new Error('Não foi possível definir uma área para a pesquisa diária.');

      try {
        campaign = await prisma.researchCampaign.create({
          data: {
            ownerId: AUTONOMOUS_CAMPAIGN_OWNER_ID,
            idempotencyKey,
            requestFingerprint: `${dateKey}:${target.niche}:${target.region}`,
            name: `Pesquisa diária · ${target.niche} · ${target.city}`,
            niche: target.niche,
            region: target.region,
            city: target.city,
            maxCandidates: settings?.prospectingDailyLimit ?? 10,
            maxAreas: AUTONOMOUS_MAX_AREA_QUERIES,
            criteria: { automatic: true, phoneOnly: false, digitalPresence: false },
            checkpoint: { areas: plan.areas },
            release: plan.release
          }
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        campaign = await prisma.researchCampaign.findUnique({ where: { idempotencyKey } });
      }
    }

    if (!campaign) return Response.json({ error: 'Não foi possível salvar a pesquisa diária.' }, { status: 500 });
    if (campaign.status === 'COMPLETED') {
      const availableCount = await countVisibleCampaignCandidates(prisma, campaign.id);
      if (availableCount >= campaign.maxCandidates) {
        if (campaign.candidateCount !== availableCount || campaign.error) {
          await prisma.researchCampaign.updateMany({
            where: { id: campaign.id, status: 'COMPLETED', checkpointVersion: campaign.checkpointVersion },
            data: { candidateCount: availableCount, error: null }
          });
        }
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
      }

      const checkpoint = campaign.checkpoint && typeof campaign.checkpoint === 'object' && !Array.isArray(campaign.checkpoint)
        ? campaign.checkpoint as { nationalFallbackUsed?: unknown; nationalSearchVersion?: unknown }
        : {};
      if (checkpoint.nationalFallbackUsed === true && checkpoint.nationalSearchVersion === AUTONOMOUS_NATIONAL_SEARCH_VERSION) {
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true, shortfall: true });
      }

      const plan = await resolveProspectSearchPlan({
        region: campaign.region,
        national: true,
        maxAreas: AUTONOMOUS_NATIONAL_BASE_AREA_QUERIES
      });
      if (!plan.areas.length) {
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true, shortfall: true });
      }
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
      if (!resumed.count) {
        return Response.json({ campaignId: campaign.id, status: 'COMPLETED', reused: true });
      }
      campaign = await prisma.researchCampaign.findUnique({ where: { id: campaign.id } });
      if (!campaign) return Response.json({ error: 'Não foi possível retomar a pesquisa diária.' }, { status: 500 });
    }
    if (campaign.status === 'CANCELLED') {
      return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
    }
    if (campaign.status === 'FAILED') {
      const checkpoint = toCheckpointRecord(campaign.checkpoint);
      const retryCount = typeof checkpoint.dispatchRetryCount === 'number' ? checkpoint.dispatchRetryCount : 0;
      const lastAttemptAt = campaign.dispatchAttemptedAt ?? campaign.updatedAt;
      if (retryCount >= MAX_DISPATCH_RETRIES) {
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true, retriesExhausted: true });
      }
      if (Date.now() - lastAttemptAt.getTime() < DISPATCH_RETRY_BACKOFF_MS) {
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true, retryPending: true });
      }
      const requeued = await prisma.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'FAILED', checkpointVersion: campaign.checkpointVersion },
        data: {
          status: 'QUEUED',
          error: null,
          workflowRunId: null,
          dispatchLeaseUntil: null,
          dispatchAttemptedAt: null,
          checkpoint: { ...checkpoint, dispatchRetryCount: retryCount + 1 } as Prisma.InputJsonObject,
          checkpointVersion: { increment: 1 }
        }
      });
      if (!requeued.count) return Response.json({ campaignId: campaign.id, status: 'FAILED', reused: true });
      campaign = await prisma.researchCampaign.findUnique({ where: { id: campaign.id } });
      if (!campaign) return Response.json({ error: 'Não foi possível recuperar a pesquisa diária.' }, { status: 500 });
    }

    if (campaign.status === 'RUNNING' && campaign.workflowRunId) {
      return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
    }
    if (campaign.status === 'RUNNING' && campaign.dispatchAttemptedAt) {
      const leaseUntil = campaign.dispatchLeaseUntil?.getTime()
        ?? campaign.dispatchAttemptedAt.getTime() + DISPATCH_LEASE_MS;
      if (leaseUntil > Date.now()) {
        return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
      }

      const recovered = await prisma.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING', workflowRunId: null, dispatchAttemptedAt: campaign.dispatchAttemptedAt },
        data: { status: 'QUEUED', dispatchLeaseUntil: null, dispatchAttemptedAt: null }
      });
      if (!recovered.count) return Response.json({ campaignId: campaign.id, status: 'RUNNING', reused: true });
      campaign = await prisma.researchCampaign.findUnique({ where: { id: campaign.id } });
      if (!campaign) return Response.json({ error: 'Não foi possível recuperar a pesquisa diária.' }, { status: 500 });
    }

    const now = new Date();
    const lease = await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: campaign.status, workflowRunId: null, OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lt: now } }] },
      data: { status: 'RUNNING', dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS), dispatchAttemptedAt: now }
    });
    if (!lease.count) return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });

    let workflow: Awaited<ReturnType<typeof startProspectingCampaign>>;
    try {
      workflow = await startProspectingCampaign(campaign.id);
    } catch (error) {
      console.error('[cron/autonomous-prospecting] Could not dispatch daily campaign', { campaignId: campaign.id, error });
      await prisma.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING', workflowRunId: null, dispatchAttemptedAt: { not: null } },
        data: { status: 'FAILED', dispatchLeaseUntil: null, error: 'Não foi possível confirmar o início da pesquisa. Confira o status antes de tentar novamente.' }
      });
      return Response.json({ error: 'A pesquisa diária foi salva, mas não pôde ser iniciada.' }, { status: 503 });
    }

    try {
      await prisma.researchCampaign.update({ where: { id: campaign.id }, data: { workflowRunId: workflow.runId, dispatchLeaseUntil: null, dispatchAttemptedAt: null } });
    } catch (error) {
      console.error('[cron/autonomous-prospecting] Workflow started but run id could not be persisted', { campaignId: campaign.id, error });
      return Response.json({ campaignId: campaign.id, status: 'RUNNING', reused: true, confirmationPending: true }, { status: 202 });
    }

    return Response.json({ campaignId: campaign.id, workflowRunId: workflow.runId, status: 'RUNNING', reused: false });
  } catch (error) {
    console.error('[cron/autonomous-prospecting] Daily research failed', error);
    return Response.json({ error: 'Não foi possível iniciar a pesquisa diária.' }, { status: 500 });
  }
}

function toCheckpointRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
