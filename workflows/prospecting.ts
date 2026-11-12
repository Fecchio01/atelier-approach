import { prisma } from '@/lib/db';
import { countVisibleCampaignCandidates, filterAvailableCampaignBusinesses, persistCampaignCandidates } from '@/lib/research/candidates';
import { enrichProspectBatch, resolveProspectSearchPlan, searchProspectArea, splitProspectSearchArea } from '@/lib/research/search-service';
import { AUTONOMOUS_CITY_AREA_QUERIES, AUTONOMOUS_NATIONAL_AREA_QUERIES } from '@/lib/research/autonomous';
import type { OvertureSearchArea } from '@/lib/overture';

type CampaignCheckpoint = { areas: OvertureSearchArea[]; nationalFallbackUsed?: boolean };

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
  const availableCount = await countVisibleCampaignCandidates(prisma, campaign.id);
  if (availableCount >= campaign.maxCandidates) {
    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING' },
      data: {
        candidateCount: availableCount,
        status: 'COMPLETED',
        error: null,
        dispatchLeaseUntil: null,
        checkpoint: { areas: [], ...(checkpoint.nationalFallbackUsed ? { nationalFallbackUsed: true } : {}) }
      }
    });
    return { completed: true, status: 'COMPLETED' };
  }

  if (!checkpoint.areas.length) {
    if (!checkpoint.nationalFallbackUsed) {
      let plan;
      try {
        plan = await resolveProspectSearchPlan({
          region: campaign.region,
          national: true,
          maxAreas: AUTONOMOUS_NATIONAL_AREA_QUERIES
        });
      } catch (error) {
        console.error('[agents/prospecting] Could not prepare national fallback', {
          campaignId,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
        await prisma.researchCampaign.updateMany({
          where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
          data: { status: 'FAILED', error: 'Não foi possível ampliar a pesquisa para outras regiões. A automação tentará retomar na próxima execução.', dispatchLeaseUntil: null }
        });
        return { completed: true, status: 'FAILED' };
      }
      if (plan.areas.length) {
        await prisma.researchCampaign.updateMany({
          where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
          data: {
            checkpoint: { areas: plan.areas, nationalFallbackUsed: true },
            checkpointVersion: { increment: 1 },
            maxAreas: Math.max(campaign.maxAreas, campaign.completedAreas + AUTONOMOUS_NATIONAL_AREA_QUERIES),
            release: plan.release,
            error: null
          }
        });
        return { completed: false, status: 'RUNNING' };
      }
    }

    await prisma.researchCampaign.updateMany({
      where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
      data: {
        candidateCount: availableCount,
        status: 'COMPLETED',
        error: campaignSearchShortfallMessage(availableCount, campaign.maxCandidates),
        dispatchLeaseUntil: null,
        checkpoint: { areas: [], ...(checkpoint.nationalFallbackUsed ? { nationalFallbackUsed: true } : {}) }
      }
    });
    return { completed: true, status: 'COMPLETED' };
  }

  const area = checkpoint.areas[0];
  try {
    const result = await searchProspectArea(area, { niche: campaign.niche, release: campaign.release ?? undefined });
    const remaining = Math.max(0, campaign.maxCandidates - availableCount);
    const eligibleBusinesses = await filterAvailableCampaignBusinesses(prisma, campaign.id, result.businesses);
    const enriched = await enrichProspectBatch(eligibleBusinesses.slice(0, remaining));
    const filtered = enriched.filter((business) => (!campaign.criteria || !readBooleanCriterion(campaign.criteria, 'phoneOnly') || Boolean(business.phone || business.whatsapp))
      && (!campaign.criteria || !readBooleanCriterion(campaign.criteria, 'digitalPresence') || Boolean(business.website || business.instagram)));
    const batch = filtered.slice(0, remaining);
    // Search smaller tiles when the source returned no/sparse results too.
    // Previously, only a full 100-row response was subdivided, so a broad tile
    // with zero matches ended the campaign immediately.
    const projectedCount = availableCount + batch.length;
    const shouldExpand = result.hitLimit || (projectedCount < campaign.maxCandidates && area.depth < 6);
    const areaBudget = checkpoint.nationalFallbackUsed
      ? campaign.maxAreas
      : Math.min(campaign.maxAreas, AUTONOMOUS_CITY_AREA_QUERIES);
    const nextAreas = [...(shouldExpand ? splitProspectSearchArea(area) : []), ...checkpoint.areas.slice(1)]
      .slice(0, Math.max(0, areaBudget - campaign.completedAreas - 1));
    await prisma.$transaction(async (tx) => {
      await persistCampaignCandidates(tx, campaign.id, batch, campaign.release, campaign.niche);
      const candidateCount = await countVisibleCampaignCandidates(tx, campaign.id);
      const exhausted = candidateCount >= campaign.maxCandidates
        || (checkpoint.nationalFallbackUsed && nextAreas.length === 0 && campaign.completedAreas + 1 >= campaign.maxAreas);
      await tx.researchCampaign.updateMany({
        where: { id: campaign.id, status: 'RUNNING', checkpointVersion: campaign.checkpointVersion },
        data: {
          checkpoint: {
            areas: nextAreas,
            ...(checkpoint.nationalFallbackUsed ? { nationalFallbackUsed: true } : {})
          },
          checkpointVersion: { increment: 1 },
          completedAreas: { increment: 1 },
          candidateCount,
          status: exhausted ? 'COMPLETED' : 'RUNNING',
          error: exhausted && candidateCount < campaign.maxCandidates
            ? campaignSearchShortfallMessage(candidateCount, campaign.maxCandidates)
            : null,
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
  const parsed = value as { areas?: unknown; nationalFallbackUsed?: unknown };
  return {
    areas: Array.isArray(parsed.areas) ? parsed.areas as OvertureSearchArea[] : [],
    ...(parsed.nationalFallbackUsed === true ? { nationalFallbackUsed: true } : {})
  };
}

function readBooleanCriterion(value: unknown, key: string) {
  return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>)[key] === true);
}

function campaignSearchShortfallMessage(candidateCount: number, maxCandidates: number) {
  return `O Darwin consultou a região inicial e a cobertura nacional, mas encontrou ${candidateCount} de ${maxCandidates} empresas válidas. O lote incompleto não foi liberado; a fonte não forneceu empresas suficientes para completar os ${maxCandidates} resultados.`;
}
