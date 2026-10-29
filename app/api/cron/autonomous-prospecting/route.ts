import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { AUTONOMOUS_CAMPAIGN_OWNER_ID, chooseDailyProspectingTarget, getSaoPauloDateKey } from '@/lib/research/autonomous';
import { resolveProspectSearchPlan } from '@/lib/research/search-service';
import { startProspectingCampaign } from '@/lib/research/runtime';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AREAS = 8;
const DISPATCH_LEASE_MS = 60_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } });
    if (settings?.paused || settings?.prospectingEnabled === false) {
      return Response.json({ skipped: true, reason: settings?.paused ? 'automation_paused' : 'research_disabled' });
    }

    const dateKey = getSaoPauloDateKey();
    const idempotencyKey = `autonomous:${dateKey}`;
    let campaign = await prisma.researchCampaign.findUnique({ where: { idempotencyKey } });
    if (!campaign) {
      const target = chooseDailyProspectingTarget(dateKey);
      const plan = await resolveProspectSearchPlan({ region: target.region, city: target.city, maxAreas: MAX_AREAS });
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
            maxAreas: MAX_AREAS,
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
      return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
    }
    if (campaign.status === 'FAILED' || campaign.status === 'CANCELLED') {
      campaign = await prisma.researchCampaign.update({
        where: { id: campaign.id },
        data: { status: 'QUEUED', error: null, workflowRunId: null, dispatchLeaseUntil: null }
      });
    }

    if (campaign.status === 'RUNNING' && campaign.workflowRunId) {
      return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });
    }

    const now = new Date();
    const lease = await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: campaign.status, workflowRunId: null, OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lt: now } }] },
      data: { status: 'RUNNING', dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS) }
    });
    if (!lease.count) return Response.json({ campaignId: campaign.id, status: campaign.status, reused: true });

    try {
      const workflow = await startProspectingCampaign(campaign.id);
      await prisma.researchCampaign.update({ where: { id: campaign.id }, data: { workflowRunId: workflow.runId, dispatchLeaseUntil: null } });
      return Response.json({ campaignId: campaign.id, workflowRunId: workflow.runId, status: 'RUNNING', reused: false });
    } catch (error) {
      console.error('[cron/autonomous-prospecting] Could not dispatch daily campaign', { campaignId: campaign.id, error });
      await prisma.researchCampaign.updateMany({
        where: { id: campaign.id, workflowRunId: null },
        data: { status: 'QUEUED', dispatchLeaseUntil: null, error: 'A pesquisa será retomada na próxima execução agendada.' }
      });
      return Response.json({ error: 'A pesquisa diária foi salva, mas não pôde ser iniciada.' }, { status: 503 });
    }
  } catch (error) {
    console.error('[cron/autonomous-prospecting] Daily research failed', error);
    return Response.json({ error: 'Não foi possível iniciar a pesquisa diária.' }, { status: 500 });
  }
}
