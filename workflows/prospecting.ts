import { prisma } from '@/lib/db';
import { persistCampaignCandidates } from '@/lib/research/candidates';
import { enrichProspectBatch, searchProspectArea, splitProspectSearchArea } from '@/lib/research/search-service';
import type { OvertureSearchArea } from '@/lib/overture';

type CampaignCheckpoint = { areas: OvertureSearchArea[] };

export async function prospectingCampaign(campaignId: string) {
  'use workflow';

  while (true) {
    const result = await processProspectingCampaignArea(campaignId);
    if (result.completed) return result;
  }
}

async function processProspectingCampaignArea(campaignId: string) {
  'use step';

  const campaign = await prisma.researchCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'CANCELLED' || campaign.status === 'FAILED') return { completed: true, status: campaign?.status ?? 'MISSING' };
  if (campaign.status === 'COMPLETED') return { completed: true, status: campaign.status };

  const checkpoint = parseCheckpoint(campaign.checkpoint);
  if (campaign.candidateCount >= campaign.maxCandidates || checkpoint.areas.length === 0) {
    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING' },
      data: { status: 'COMPLETED', error: null, dispatchLeaseUntil: null }
    });
    return { completed: true, status: 'COMPLETED' };
  }

  const area = checkpoint.areas[0];
  try {
    const result = await searchProspectArea(area, { niche: campaign.niche, release: campaign.release ?? undefined });
    const remaining = Math.max(0, campaign.maxCandidates - campaign.candidateCount);
    const enriched = await enrichProspectBatch(result.businesses.slice(0, Math.max(remaining, 1)));
    const filtered = enriched.filter((business) => (!campaign.criteria || !readBooleanCriterion(campaign.criteria, 'phoneOnly') || Boolean(business.phone || business.whatsapp))
      && (!campaign.criteria || !readBooleanCriterion(campaign.criteria, 'digitalPresence') || Boolean(business.website || business.instagram)));
    const batch = filtered.slice(0, remaining);
    const nextAreas = [...(result.hitLimit ? splitProspectSearchArea(area) : []), ...checkpoint.areas.slice(1)]
      .slice(0, Math.max(0, campaign.maxAreas - campaign.completedAreas - 1));
    await prisma.$transaction(async (tx) => {
      await persistCampaignCandidates(tx, campaign.id, batch, campaign.release);
      const candidateCount = await tx.researchCampaignCandidate.count({ where: { campaignId: campaign.id } });
      await tx.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
        data: {
          checkpoint: { areas: nextAreas },
          checkpointVersion: { increment: 1 },
          completedAreas: { increment: 1 },
          candidateCount,
          status: candidateCount >= campaign.maxCandidates || nextAreas.length === 0 ? 'COMPLETED' : 'RUNNING',
          error: null,
          dispatchLeaseUntil: null
        }
      });
    });

    const latest = await prisma.researchCampaign.findUnique({ where: { id: campaign.id }, select: { status: true } });
    return { completed: latest?.status === 'COMPLETED', status: latest?.status ?? 'MISSING' };
  } catch (error) {
    console.error('[agents/prospecting] Campaign batch failed', {
      campaignId,
      area,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
      data: { status: 'FAILED', error: 'Uma área não pôde ser processada. A campanha pode ser retomada do checkpoint.', dispatchLeaseUntil: null }
    });
    return { completed: true, status: 'FAILED' };
  }
}

function parseCheckpoint(value: unknown): CampaignCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { areas: [] };
  const areas = (value as { areas?: unknown }).areas;
  return { areas: Array.isArray(areas) ? areas as OvertureSearchArea[] : [] };
}

function readBooleanCriterion(value: unknown, key: string) {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>)[key] === true);
}
