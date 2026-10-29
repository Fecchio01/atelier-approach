import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createResearchCampaignSchema } from '@/lib/research/contracts';
import { resolveProspectSearchPlan } from '@/lib/research/search-service';
import { startProspectingCampaign } from '@/lib/research/runtime';

export const runtime = 'nodejs';

const MAX_DAILY_CANDIDATE_BUDGET = 20;
const DISPATCH_LEASE_MS = 60_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const campaigns = await prisma.researchCampaign.findMany({
    where: { OR: [{ ownerId: user.id }, { ownerId: 'team' }] },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      candidates: {
        orderBy: { firstSeenAt: 'desc' },
        take: 20,
        include: { candidate: { include: { evidence: { orderBy: { capturedAt: 'desc' }, take: 8 } } } }
      }
    }
  });
  return Response.json({ campaigns });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const parsed = createResearchCampaignSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Confira nicho, região e limites da campanha.' }, { status: 400 });
  const input = parsed.data;
  const requestFingerprint = createHash('sha256').update(JSON.stringify({
    niche: input.niche, region: input.region, city: input.city ?? null,
    maxCandidates: input.maxCandidates, maxAreas: input.maxAreas,
    phoneOnly: input.phoneOnly, digitalPresence: input.digitalPresence
  })).digest('hex');

  let campaign = await prisma.researchCampaign.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  let reused = Boolean(campaign);
  if (campaign && campaign.ownerId !== user.id) return Response.json({ error: 'Chave de campanha inválida.' }, { status: 409 });
  if (campaign && campaign.requestFingerprint !== requestFingerprint) {
    return Response.json({ error: 'Esta chave já foi usada com outros parâmetros.' }, { status: 409 });
  }

  if (!campaign) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dailyBudget = await prisma.researchCampaign.aggregate({
      where: { ownerId: user.id, createdAt: { gte: dayStart } },
      _sum: { maxCandidates: true }
    });
    if ((dailyBudget._sum.maxCandidates ?? 0) + input.maxCandidates > MAX_DAILY_CANDIDATE_BUDGET) {
      return Response.json({ error: 'O limite de 20 novos candidatos por pessoa, por dia, foi atingido.' }, { status: 429 });
    }

    let plan;
    try {
      plan = await resolveProspectSearchPlan({ region: input.region, city: input.city, maxAreas: input.maxAreas });
    } catch {
      return Response.json({ error: 'Não foi possível preparar a pesquisa para esta região agora.' }, { status: 503 });
    }
    if (!plan.areas.length) return Response.json({ error: 'Nenhuma área de pesquisa válida foi encontrada.' }, { status: 422 });

    try {
      campaign = await prisma.researchCampaign.create({
        data: {
          ownerId: user.id,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          name: input.name ?? `${input.niche} · ${input.city ? `${input.city}, ` : ''}${input.region}`,
          niche: input.niche,
          region: input.region,
          city: input.city,
          maxCandidates: input.maxCandidates,
          maxAreas: input.maxAreas,
          criteria: { phoneOnly: input.phoneOnly, digitalPresence: input.digitalPresence },
          checkpoint: { areas: plan.areas },
          release: plan.release
        }
      });
      reused = false;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      campaign = await prisma.researchCampaign.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (!campaign || campaign.ownerId !== user.id || campaign.requestFingerprint !== requestFingerprint) {
        return Response.json({ error: 'A campanha foi criada em outra solicitação. Atualize e tente novamente.' }, { status: 409 });
      }
      reused = true;
    }
  }

  if (!campaign) return Response.json({ error: 'Não foi possível criar a campanha.' }, { status: 500 });
  if (campaign.status === 'FAILED') {
    campaign = await prisma.researchCampaign.update({
      where: { id: campaign.id },
      data: { status: 'QUEUED', error: null, workflowRunId: null, dispatchLeaseUntil: null }
    });
  }

  let workflowRunId = campaign.workflowRunId;
  if (campaign.status === 'QUEUED' && !workflowRunId) {
    const now = new Date();
    const lease = await prisma.researchCampaign.updateMany({
      where: {
        id: campaign.id,
        status: 'QUEUED',
        workflowRunId: null,
        OR: [{ dispatchLeaseUntil: null }, { dispatchLeaseUntil: { lt: now } }]
      },
      data: { status: 'RUNNING', dispatchLeaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS) }
    });
    if (lease.count) {
      try {
        const workflow = await startProspectingCampaign(campaign.id);
        workflowRunId = workflow.runId;
        await prisma.researchCampaign.update({ where: { id: campaign.id }, data: { workflowRunId, dispatchLeaseUntil: null } });
      } catch (error) {
        console.error('[agents/campaigns] Could not start campaign workflow', { campaignId: campaign.id, error });
        await prisma.researchCampaign.updateMany({
          where: { id: campaign.id, workflowRunId: null },
          data: { status: 'QUEUED', dispatchLeaseUntil: null, error: 'A campanha será retomada na próxima solicitação.' }
        });
        return Response.json({ error: 'A campanha foi salva e poderá ser retomada ao atualizar.' }, { status: 503 });
      }
    }
  }

  const current = await prisma.researchCampaign.findUnique({ where: { id: campaign.id }, select: { status: true, workflowRunId: true } });
  return Response.json({ campaignId: campaign.id, workflowRunId: current?.workflowRunId ?? workflowRunId, status: current?.status ?? campaign.status, reused }, { status: 202 });
}
