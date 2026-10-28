import { ActivityType, Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { agentDecisionSchema } from '@/lib/agents/contracts';
import { hashApproval } from '@/lib/agents/model';
import { deliverAgentOutbox } from '@/lib/agents/outbox';
import { createHumanCrmActor } from '@/lib/crm/actor';
import { withCrmActivityActor } from '@/lib/crm/commands';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: 'Decisão inválida.' }, { status: 400 }); }
  const parsed = agentDecisionSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Decisão inválida.' }, { status: 400 });

  const existing = await prisma.agentAction.findUnique({ where: { id }, include: { run: true, lead: true, outbox: true } });
  if (!existing) return Response.json({ error: 'Sugestão não encontrada.' }, { status: 404 });
  if (existing.approvalHash !== parsed.data.approvalHash) {
    return Response.json({ error: 'A sugestão mudou. Reavalie antes de aprovar.' }, { status: 409 });
  }
  if (parsed.data.decision === 'EDIT') {
    if (existing.status !== 'PENDING') return Response.json({ error: 'Somente sugestões pendentes podem ser editadas.' }, { status: 409 });
    const next = {
      title: parsed.data.edits.title ?? existing.title,
      description: parsed.data.edits.description ?? existing.description,
      dueDate: parsed.data.edits.dueDate ?? existing.dueDate.toISOString(),
      taskType: existing.taskType,
      priority: existing.priority
    };
    const nextHash = hashApproval(next);
    const changed = await prisma.$transaction(async (tx) => {
      const currentLead = await tx.lead.findUnique({ where: { id: existing.leadId }, select: { version: true } });
      if (!currentLead || currentLead.version !== existing.leadVersion) {
        const markedStale = await tx.agentAction.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'STALE' } });
        if (!markedStale.count) return { count: 0 };
        await tx.agentOutbox.upsert({
          where: { actionId: id },
          create: { actionId: id, payload: { token: existing.approvalToken, decision: 'REJECT', approvalHash: existing.approvalHash } },
          update: { payload: { token: existing.approvalToken, decision: 'REJECT', approvalHash: existing.approvalHash }, status: 'PENDING' }
        });
        return null;
      }
      return tx.agentAction.updateMany({
        where: { id, status: 'PENDING', approvalHash: parsed.data.approvalHash },
        data: { title: next.title, description: next.description, dueDate: new Date(next.dueDate), approvalHash: nextHash }
      });
    });
    if (!changed) {
      await deliverAgentOutbox();
      return Response.json({ error: 'A empresa mudou. Essa sugestão foi invalidada; inicie uma nova análise.' }, { status: 409 });
    }
    if (!changed.count) return Response.json({ error: 'A sugestão mudou em outra sessão. Atualize antes de editar.' }, { status: 409 });
    return Response.json({ status: 'PENDING', approvalHash: nextHash, action: next });
  }
  if (existing.status === 'APPLIED' || existing.status === 'REJECTED' || existing.status === 'STALE') {
    await deliverAgentOutbox();
    return Response.json({ status: existing.status, idempotent: true });
  }
  if (existing.status !== 'PENDING') return Response.json({ error: 'Sugestão não está mais pendente.' }, { status: 409 });

  const actor = createHumanCrmActor(user.id);
  const decision = parsed.data.decision;
  let result: { status: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const current = await tx.agentAction.findUnique({ where: { id }, include: { lead: true, run: true } });
      if (!current || current.status !== 'PENDING') return { status: current?.status ?? 'MISSING' };

      if (current.approvalHash !== parsed.data.approvalHash) throw new Error('APPROVAL_HASH_CHANGED');
      if (current.lead.version !== current.leadVersion || current.run.leadVersion !== current.leadVersion) {
        await tx.agentAction.update({ where: { id }, data: { status: 'STALE' } });
        await tx.agentOutbox.upsert({
          where: { actionId: id },
          create: { actionId: id, payload: { token: current.approvalToken, decision: 'REJECT', approvalHash: current.approvalHash } },
          update: { payload: { token: current.approvalToken, decision: 'REJECT', approvalHash: current.approvalHash }, status: 'PENDING' }
        });
        return { status: 'STALE' };
      }

      const claimed = await tx.agentAction.updateMany({ where: { id, status: 'PENDING', approvalHash: parsed.data.approvalHash }, data: {
        status: decision === 'APPROVE' ? 'APPLIED' : 'REJECTED',
        approvedById: decision === 'APPROVE' ? actor.id : null,
        approvedAt: decision === 'APPROVE' ? new Date() : null,
        appliedAt: decision === 'APPROVE' ? new Date() : null,
        rejectedAt: decision === 'REJECT' ? new Date() : null
      } });
      if (!claimed.count) return { status: 'CONFLICT' };

      if (decision === 'APPROVE') {
        const leadClaim = await tx.lead.updateMany({ where: { id: current.leadId, version: current.leadVersion }, data: { version: { increment: 1 } } });
        if (!leadClaim.count) throw new Error('LEAD_VERSION_CHANGED');
        const task = await tx.crmTask.create({ data: {
          leadId: current.leadId,
          title: current.title,
          type: current.taskType,
          priority: current.priority,
          dueDate: current.dueDate,
          assigneeId: actor.id,
          createdById: actor.id,
          updatedById: actor.id
        } });
        await tx.activity.create({ data: withCrmActivityActor(actor, {
          leadId: current.leadId,
          type: ActivityType.CRM_TASK_CREATED,
          note: `Tarefa sugerida pelo assistente e aprovada pela equipe: ${task.title}`
        }) });
      }

      await tx.agentOutbox.upsert({
        where: { actionId: id },
        create: { actionId: id, payload: { token: current.approvalToken, decision, approvalHash: current.approvalHash } },
        update: { payload: { token: current.approvalToken, decision, approvalHash: current.approvalHash }, status: 'PENDING' }
      });
      return { status: decision === 'APPROVE' ? 'APPLIED' : 'REJECTED' };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return Response.json({ error: 'A empresa mudou durante a aprovação; peça uma nova análise.' }, { status: 409 });
    }
    if (error instanceof Error && (error.message === 'APPROVAL_HASH_CHANGED' || error.message === 'LEAD_VERSION_CHANGED')) {
      return Response.json({ error: 'A empresa ou a sugestão mudou. Peça uma nova análise antes de aprovar.' }, { status: 409 });
    }
    throw error;
  }

  await deliverAgentOutbox();
  return Response.json({ status: result.status });
}
