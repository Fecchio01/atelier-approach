import { ActivityType, CadenceStatus, CrmTaskPriority, CrmTaskType, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/db';
import { parseCrmTaskDueDate } from '../../../../../lib/crm-task-queue';
import { createHumanCrmActor } from '../../../../../lib/crm/actor';
import { executeCrmCommand, withCrmActivityActor } from '../../../../../lib/crm/commands';
import { cadencePolicy, getCadenceDueAt } from '@/lib/agents/specialists/follow-up';

type TaskAction = 'UPDATE' | 'COMPLETE' | 'CANCEL';

function isTaskAction(value: unknown): value is TaskAction {
  return value === 'UPDATE' || value === 'COMPLETE' || value === 'CANCEL';
}

function parseExpectedUpdatedAt(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString() === value ? date : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const actor = createHumanCrmActor(user.id);

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    body = value as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Atualização da tarefa inválida.' }, { status: 400 });
  }
  if (!isTaskAction(body.action)) return Response.json({ error: 'Ação da tarefa inválida.' }, { status: 400 });

  const action = body.action;
  const data: Prisma.CrmTaskUpdateManyMutationInput = { updatedById: user.id };
  const changes: string[] = [];
  if (action === 'UPDATE') {
    if (Object.hasOwn(body, 'title')) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160) return Response.json({ error: 'A descrição deve ter entre 1 e 160 caracteres.' }, { status: 400 });
      data.title = body.title.trim();
      changes.push('descrição');
    }
    if (Object.hasOwn(body, 'type')) {
      if (typeof body.type !== 'string' || !Object.values(CrmTaskType).includes(body.type as CrmTaskType)) return Response.json({ error: 'Tipo de ação inválido.' }, { status: 400 });
      data.type = body.type as CrmTaskType;
      changes.push('tipo');
    }
    if (Object.hasOwn(body, 'priority')) {
      if (typeof body.priority !== 'string' || !Object.values(CrmTaskPriority).includes(body.priority as CrmTaskPriority)) return Response.json({ error: 'Prioridade inválida.' }, { status: 400 });
      data.priority = body.priority as CrmTaskPriority;
      changes.push('prioridade');
    }
    if (Object.hasOwn(body, 'dueDate')) {
      const dueDate = parseCrmTaskDueDate(body.dueDate);
      if (!dueDate) return Response.json({ error: 'Data de vencimento inválida.' }, { status: 400 });
      data.dueDate = dueDate;
      changes.push('data de vencimento');
    }
    if (Object.hasOwn(body, 'assigneeId')) {
      if (typeof body.assigneeId !== 'string' || !body.assigneeId.trim() || body.assigneeId.trim().length > 128) return Response.json({ error: 'Responsável inválido.' }, { status: 400 });
      const assignee = await prisma.memberProfile.findUnique({ where: { id: body.assigneeId.trim() }, select: { id: true } });
      if (!assignee) return Response.json({ error: 'Responsável não encontrado na equipe.' }, { status: 404 });
      data.assigneeId = assignee.id;
      changes.push('responsável');
    }
    if (!changes.length) return Response.json({ error: 'Informe o que deve ser atualizado.' }, { status: 400 });
  }

  const expectedUpdatedAt = action === 'UPDATE' ? parseExpectedUpdatedAt(body.expectedUpdatedAt) : null;
  if (action === 'UPDATE' && !expectedUpdatedAt) return Response.json({ error: 'Atualize a fila antes de editar esta ação.' }, { status: 400 });

  const { id } = await params;
  const result = await executeCrmCommand(prisma, actor, async (tx, actor) => {
    const current = await tx.crmTask.findUnique({ where: { id } });
    if (!current) return { kind: 'NOT_FOUND' as const };

    if (action === 'COMPLETE' && current.state === 'COMPLETED') return { kind: 'OK' as const, task: current };
    if (action === 'CANCEL' && current.state === 'CANCELLED') return { kind: 'OK' as const, task: current };
    if (current.state !== 'PENDING') return { kind: 'CONFLICT' as const, task: current };

    const now = new Date();
    const updateData: Prisma.CrmTaskUpdateManyMutationInput = action === 'COMPLETE'
      ? { state: 'COMPLETED', completedAt: now, completedById: actor.id, updatedById: actor.id }
      : action === 'CANCEL'
        ? { state: 'CANCELLED', cancelledAt: now, cancelledById: actor.id, updatedById: actor.id }
        : data;
    const update = await tx.crmTask.updateMany({
      where: { id, state: 'PENDING', ...(action === 'UPDATE' ? { updatedAt: expectedUpdatedAt! } : {}) },
      data: updateData
    });
    if (update.count !== 1) {
      const latest = await tx.crmTask.findUnique({ where: { id } });
      return latest ? { kind: 'CONFLICT' as const, task: latest } : { kind: 'NOT_FOUND' as const };
    }

    const updated = await tx.crmTask.findUniqueOrThrow({ where: { id } });
    const type = action === 'COMPLETE'
      ? ActivityType.CRM_TASK_COMPLETED
      : action === 'CANCEL'
        ? ActivityType.CRM_TASK_CANCELLED
        : ActivityType.CRM_TASK_UPDATED;
    const note = action === 'COMPLETE'
      ? `Ação concluída: ${current.title}.`
      : action === 'CANCEL'
        ? `Ação cancelada: ${current.title}.`
        : `Ação atualizada (${changes.join(', ')}): ${updated.title}.`;
    await tx.activity.create({ data: withCrmActivityActor(actor, { leadId: current.leadId, type, note }) });
    const cadenceId = current.effectKey?.match(/^cadence:([^:]+):\d+$/)?.[1];
    if (cadenceId && (action === 'COMPLETE' || action === 'CANCEL')) {
      const cadence = await tx.cadenceEnrollment.findUnique({ where: { id: cadenceId } });
      if (cadence?.status === CadenceStatus.WAITING_HUMAN && cadence.activeTaskId === current.id) {
        await tx.cadenceEnrollment.update({ where: { id: cadence.id }, data: action === 'COMPLETE'
          ? cadence.attempt >= cadencePolicy.maxAttempts
            ? { status: CadenceStatus.COMPLETED, activeTaskId: null, pauseReason: null, lastActivityAt: now }
            : { status: CadenceStatus.ACTIVE, activeTaskId: null, pauseReason: null, lastActivityAt: now, nextDueAt: getCadenceDueAt(now, cadencePolicy.nextBusinessDays) }
          : { status: CadenceStatus.PAUSED, activeTaskId: null, pauseReason: 'A ação humana da cadência foi cancelada.' }
        });
      }
    }
    return { kind: 'OK' as const, task: updated };
  });

  if (result.kind === 'NOT_FOUND') return Response.json({ error: 'Ação não encontrada.' }, { status: 404 });
  if (result.kind === 'CONFLICT') return Response.json({ error: 'Esta ação mudou em outra sessão. Atualize a fila e tente novamente.' }, { status: 409 });
  return Response.json({ task: {
    id: result.task.id,
    leadId: result.task.leadId,
    state: result.task.state,
    dueDate: result.task.dueDate.toISOString(),
    updatedAt: result.task.updatedAt.toISOString()
  } });
}
