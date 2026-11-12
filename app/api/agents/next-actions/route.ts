import { ActivityType, Prisma } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createHumanCrmActor } from '@/lib/crm/actor';
import { executeCrmCommand, withCrmActivityActor } from '@/lib/crm/commands';
import { buildNextBestActions, getSaoPauloDateKey, saoPauloDayBounds, type NextActionLead } from '@/lib/agents/next-best-actions';
import { countVisibleCampaignCandidates } from '@/lib/research/candidates';

export const runtime = 'nodejs';

const openStages = ['IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP'] as const;
const requestSchema = z.object({ leadId: z.string().trim().min(1).max(128) }).strict();

function candidateFields(lead: NextActionLead) {
  return {
    id: lead.id, name: lead.name, stage: lead.stage, stageEnteredAt: lead.stageEnteredAt,
    lastMeaningfulInteractionAt: lead.lastMeaningfulInteractionAt,
    phone: lead.phone, whatsapp: lead.whatsapp, website: lead.website, instagram: lead.instagram
  };
}

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const now = new Date();
  const today = getSaoPauloDateKey(now);
  const { start: dayStart } = saoPauloDayBounds(today);
  const [leads, pendingTasks, pendingFollowUps, overdueFollowUpCount, campaign] = await Promise.all([
    prisma.lead.findMany({
      where: { stage: { in: [...openStages] }, discardedAt: null },
      select: {
        id: true, name: true, stage: true, stageEnteredAt: true, lastMeaningfulInteractionAt: true,
        phone: true, whatsapp: true, website: true, instagram: true
      },
      orderBy: [{ stageEnteredAt: 'asc' }, { name: 'asc' }],
      take: 500
    }),
    prisma.crmTask.findMany({ where: { state: 'PENDING' }, select: { leadId: true } }),
    prisma.followUp.findMany({ where: { state: 'PENDING' }, select: { leadId: true } }),
    prisma.followUp.count({ where: { state: 'PENDING', dueDate: { lt: dayStart } } }),
    prisma.researchCampaign.findUnique({
      where: { idempotencyKey: `autonomous:${today}` },
      select: { id: true, status: true, candidates: { where: { candidate: { status: 'REVIEW_IDENTITY', discardedAt: null, leadId: null } }, select: { candidateId: true } } }
    })
  ]);

  const availableCandidateCount = campaign ? await countVisibleCampaignCandidates(prisma, campaign.id) : 0;
  const leadsWithOpenWork = new Set([...pendingTasks, ...pendingFollowUps].map(({ leadId }) => leadId));
  const suggestions = buildNextBestActions(leads as NextActionLead[], leadsWithOpenWork, now);
  return Response.json({
    preparedAt: now.toISOString(),
    summary: {
      research: { status: campaign?.status ?? 'NOT_RUN', candidates: availableCandidateCount },
      identityPending: campaign?.candidates.length ?? 0,
      overdueFollowUps: overdueFollowUpCount,
      actionableSuggestions: suggestions.length
    },
    suggestions
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Selecione uma empresa válida.' }, { status: 400 });

  const now = new Date();
  const dateKey = getSaoPauloDateKey(now);
  try {
    const task = await executeCrmCommand(prisma, createHumanCrmActor(user.id), async (tx, actor) => {
      const lead = await tx.lead.findUnique({
        where: { id: body.data.leadId },
        select: {
          id: true, name: true, stage: true, stageEnteredAt: true, lastMeaningfulInteractionAt: true,
          phone: true, whatsapp: true, website: true, instagram: true, discardedAt: true
        }
      });
      if (!lead || lead.discardedAt || lead.stage === 'WON' || lead.stage === 'DISCARDED') return null;
      const [openTask, openFollowUp] = await Promise.all([
        tx.crmTask.findFirst({ where: { leadId: lead.id, state: 'PENDING' }, select: { id: true } }),
        tx.followUp.findFirst({ where: { leadId: lead.id, state: 'PENDING' }, select: { id: true } })
      ]);
      if (openTask || openFollowUp) return null;

      const suggestion = buildNextBestActions([candidateFields(lead)], new Set(), now, 1)[0];
      if (!suggestion) return null;
      const { end } = saoPauloDayBounds(dateKey);
      const cutoff = new Date(end.valueOf() - 7_200_000); // 17:00 in São Paulo.
      const dueDate = now.valueOf() < cutoff.valueOf() ? cutoff : now;
      const effectKey = `darwin-next-action:${dateKey}:${lead.id}`;
      const created = await tx.crmTask.create({ data: {
        leadId: lead.id,
        title: suggestion.title,
        type: suggestion.suggestedTaskType,
        priority: suggestion.suggestedPriority,
        dueDate,
        assigneeId: user.id,
        createdById: actor.id,
        updatedById: actor.id,
        effectKey
      } });
      await tx.activity.create({ data: withCrmActivityActor(actor, {
        leadId: lead.id,
        type: ActivityType.CRM_TASK_CREATED,
        note: `Ação sugerida por Darwin, revisada e criada por ${user.name || user.email || 'membro da equipe'}: ${created.title}. ${suggestion.reason}`
      }) });
      return { id: created.id, leadId: created.leadId, title: created.title, dueDate: created.dueDate.toISOString() };
    });
    if (!task) return Response.json({ error: 'Esta sugestão deixou de estar disponível. Atualize a lista.' }, { status: 409 });
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'Já existe uma ação Darwin criada para esta empresa hoje. Atualize a lista.' }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return Response.json({ error: 'A empresa ou o membro não está mais disponível no CRM.' }, { status: 404 });
    }
    throw error;
  }
}

