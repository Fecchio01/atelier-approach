import { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAnalyzeLead, automationPolicy } from '@/lib/agents/policy';
import { createAgentRunSchema } from '@/lib/agents/contracts';
import { startCommercialLeadAnalysis } from '@/lib/agents/runtime';
import { deliverAgentOutbox } from '@/lib/agents/outbox';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  await deliverAgentOutbox();
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { lead: { select: { id: true, name: true, stage: true, version: true } }, actions: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });
  return Response.json({ runs });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Dados inválidos.' }, { status: 400 }); }
  const parsed = createAgentRunSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Selecione uma empresa válida.' }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return Response.json({ error: 'Empresa não encontrada.' }, { status: 404 });
  if (!canAnalyzeLead(lead)) return Response.json({ error: 'Essa empresa não está disponível para análise.' }, { status: 409 });

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const [dailyCount, pendingCount] = await Promise.all([
    prisma.agentRun.count({ where: { createdById: user.id, createdAt: { gte: dayStart } } }),
    prisma.agentRun.count({ where: { createdById: user.id, status: { in: ['QUEUED', 'RUNNING', 'NEEDS_APPROVAL'] } } })
  ]);
  if (dailyCount >= automationPolicy.maxRunsPerMemberPerDay || pendingCount >= automationPolicy.maxPendingRunsPerMember) {
    return Response.json({ error: 'Limite de análises simultâneas ou diárias atingido.' }, { status: 429 });
  }

  const idempotencyKey = `${lead.id}:${lead.version}:${automationPolicy.version}`;
  let run = await prisma.agentRun.findUnique({ where: { idempotencyKey }, include: { actions: true } });
  let reused = Boolean(run);
  if (!run) {
    try {
      run = await prisma.agentRun.create({
        data: {
          idempotencyKey,
          leadId: lead.id,
          createdById: user.id,
          policyVersion: automationPolicy.version,
          leadVersion: lead.version,
          inputSnapshot: {
            id: lead.id, version: lead.version, name: lead.name?.slice(0, 160) ?? '', stage: lead.stage,
            phone: lead.phone?.slice(0, 64) ?? null, whatsapp: lead.whatsapp?.slice(0, 64) ?? null,
            website: lead.website?.slice(0, 180) ?? null, instagram: lead.instagram?.slice(0, 180) ?? null,
            address: lead.address?.slice(0, 240) ?? null, category: lead.category?.slice(0, 120) ?? null
          }
        },
        include: { actions: true }
      });
      reused = false;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      run = await prisma.agentRun.findUnique({ where: { idempotencyKey }, include: { actions: true } });
      reused = true;
    }
  }
  if (!run) return Response.json({ error: 'Não foi possível criar a análise.' }, { status: 500 });

  let workflowRunId = run.workflowRunId;
  if (run.status === 'QUEUED' && !workflowRunId) {
    try {
      const workflowRun = await startCommercialLeadAnalysis(run.id);
      workflowRunId = workflowRun.runId;
      await prisma.agentRun.updateMany({ where: { id: run.id, workflowRunId: null }, data: { workflowRunId } });
    } catch (error) {
      console.error('Falha ao iniciar análise durável do CRM', { runId: run.id, error });
      return Response.json({ error: 'A análise foi registrada e será retomada. Tente atualizar a página.' }, { status: 503 });
    }
  }

  return Response.json({ runId: run.id, workflowRunId, status: run.status, reused }, { status: 202 });
}
