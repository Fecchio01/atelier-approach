import { ActivityType } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type BulkTaskAction = 'COMPLETE' | 'CANCEL' | 'REASSIGN';
type VersionedTask = { id: string; updatedAt: Date };

function parseVersionedTask(value: unknown): VersionedTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id.trim() || input.id.trim().length > 128) return null;
  if (typeof input.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.updatedAt)) return null;
  const updatedAt = new Date(input.updatedAt);
  if (!Number.isFinite(updatedAt.valueOf()) || updatedAt.toISOString() !== input.updatedAt) return null;
  return { id: input.id.trim(), updatedAt };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados da operação em lote inválidos.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Dados da operação em lote inválidos.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.action !== 'COMPLETE' && input.action !== 'CANCEL' && input.action !== 'REASSIGN') {
    return Response.json({ error: 'Operação em lote inválida.' }, { status: 400 });
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    return Response.json({ error: 'Selecione de 1 a 100 tarefas por operação.' }, { status: 400 });
  }
  const tasks = input.items.map(parseVersionedTask);
  if (tasks.some((task) => !task)) return Response.json({ error: 'A lista contém tarefas ou versões inválidas.' }, { status: 400 });
  const versionedTasks = tasks as VersionedTask[];
  if (new Set(versionedTasks.map(({ id }) => id)).size !== versionedTasks.length) {
    return Response.json({ error: 'A lista contém tarefas repetidas.' }, { status: 400 });
  }

  let assignee: { id: string; name: string } | null = null;
  if (input.action === 'REASSIGN') {
    if (typeof input.assigneeId !== 'string' || !input.assigneeId.trim() || input.assigneeId.trim().length > 128) {
      return Response.json({ error: 'Selecione um responsável válido.' }, { status: 400 });
    }
    assignee = await prisma.memberProfile.findUnique({ where: { id: input.assigneeId.trim() }, select: { id: true, name: true } });
    if (!assignee) return Response.json({ error: 'Responsável não encontrado na equipe.' }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    let unchangedCount = 0;
    const now = new Date();
    const versionPairs = versionedTasks.map(({ id, updatedAt }) => ({ id, updatedAt }));
    let candidatePairs = versionPairs;
    if (input.action === 'REASSIGN' && assignee) {
      const eligible = await tx.crmTask.findMany({
        where: { state: 'PENDING', OR: versionPairs },
        select: { id: true, updatedAt: true, assigneeId: true }
      });
      unchangedCount = eligible.filter((task) => task.assigneeId === assignee.id).length;
      candidatePairs = eligible.filter((task) => task.assigneeId !== assignee.id).map(({ id, updatedAt }) => ({ id, updatedAt }));
    }

    if (!candidatePairs.length) return { updatedCount: 0, skippedCount: versionedTasks.length - unchangedCount, unchangedCount };
    const data = input.action === 'COMPLETE'
      ? { state: 'COMPLETED' as const, completedAt: now, completedById: user.id, updatedById: user.id }
      : input.action === 'CANCEL'
        ? { state: 'CANCELLED' as const, cancelledAt: now, cancelledById: user.id, updatedById: user.id }
        : { assigneeId: assignee!.id, updatedById: user.id };
    const updated = await tx.crmTask.updateManyAndReturn({
      where: { state: 'PENDING', OR: candidatePairs },
      data,
      select: { id: true, leadId: true, title: true }
    });

    if (updated.length) {
      const type = input.action === 'COMPLETE'
        ? ActivityType.CRM_TASK_COMPLETED
        : input.action === 'CANCEL'
          ? ActivityType.CRM_TASK_CANCELLED
          : ActivityType.CRM_TASK_UPDATED;
      await tx.activity.createMany({
        data: updated.map((task) => ({
          leadId: task.leadId,
          actorId: user.id,
          type,
          note: input.action === 'COMPLETE'
            ? `Ação concluída: ${task.title}.`
            : input.action === 'CANCEL'
              ? `Ação cancelada: ${task.title}.`
              : `Ação reatribuída em lote para ${assignee!.name}: ${task.title}.`
        }))
      });
    }

    const updatedCount = updated.length;
    return { updatedCount, skippedCount: versionedTasks.length - updatedCount - unchangedCount, unchangedCount };
  });

  return Response.json(result);
}
