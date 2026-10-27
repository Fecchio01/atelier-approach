import { ActivityType, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { filterAndSortCrmQueue, parseCrmTaskCreateInput, type CrmQueueItem } from '../../../../lib/crm-task-queue';
import { createHumanCrmActor } from '../../../../lib/crm/actor';
import { executeCrmCommand, withCrmActivityActor } from '../../../../lib/crm/commands';

export async function GET(_request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const [tasks, followUps, members] = await Promise.all([
    prisma.crmTask.findMany({
      where: { state: 'PENDING' },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }]
    }),
    prisma.followUp.findMany({
      where: { state: 'PENDING' },
      include: { lead: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }]
    }),
    prisma.memberProfile.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
  ]);
  const publicMembers = members.map(({ id, name }) => ({ id, name }));
  const names = new Map(publicMembers.map(({ id, name }) => [id, name]));
  const items: CrmQueueItem[] = [
    ...tasks.map((task) => ({
      kind: 'TASK' as const,
      id: task.id,
      leadId: task.leadId,
      leadName: task.lead.name?.trim() || 'Empresa sem nome',
      title: task.title,
      taskType: task.type,
      priority: task.priority,
      dueDate: task.dueDate,
      assigneeId: task.assigneeId,
      assigneeName: names.get(task.assigneeId) ?? 'Membro removido',
      state: 'PENDING' as const,
      updatedAt: task.updatedAt
    })),
    ...followUps.map((followUp) => ({
      kind: 'FOLLOW_UP' as const,
      id: followUp.id,
      leadId: followUp.leadId,
      leadName: followUp.lead.name?.trim() || 'Empresa sem nome',
      title: followUp.note.trim() || 'Follow-up',
      priority: 'NORMAL' as const,
      dueDate: followUp.dueDate,
      assigneeId: followUp.ownerId,
      assigneeName: names.get(followUp.ownerId) ?? 'Membro removido',
      state: 'PENDING' as const,
      returnStage: followUp.returnStage
    }))
  ];
  const sorted = filterAndSortCrmQueue(items, { period: 'ALL' });

  return Response.json({
    items: sorted.map((item) => ({
      ...item,
      dueDate: new Date(item.dueDate).toISOString(),
      ...('updatedAt' in item && item.updatedAt ? { updatedAt: new Date(item.updatedAt).toISOString() } : {})
    })),
    members: publicMembers
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados da tarefa inválidos.' }, { status: 400 });
  }
  const parsed = parseCrmTaskCreateInput(body);
  if (!parsed.ok) return Response.json({ error: 'Revise empresa, descrição, tipo, prioridade, responsável e data de vencimento.', field: parsed.field }, { status: 400 });

  const [lead, assignee] = await Promise.all([
    prisma.lead.findUnique({ where: { id: parsed.value.leadId }, select: { id: true } }),
    prisma.memberProfile.findUnique({ where: { id: parsed.value.assigneeId }, select: { id: true } })
  ]);
  if (!lead) return Response.json({ error: 'Empresa não encontrada no CRM.' }, { status: 404 });
  if (!assignee) return Response.json({ error: 'Responsável não encontrado na equipe.' }, { status: 404 });

  try {
    const task = await executeCrmCommand(prisma, createHumanCrmActor(user.id), async (tx, actor) => {
      const created = await tx.crmTask.create({ data: {
        ...parsed.value,
        createdById: actor.id,
        updatedById: actor.id
      } });
      await tx.activity.create({ data: withCrmActivityActor(actor, {
        leadId: created.leadId,
        type: ActivityType.CRM_TASK_CREATED,
        note: `Ação criada: ${created.title}.`
      }) });
      return created;
    });

    return Response.json({ task: {
      id: task.id,
      leadId: task.leadId,
      title: task.title,
      type: task.type,
      priority: task.priority,
      dueDate: task.dueDate.toISOString(),
      assigneeId: task.assigneeId,
      state: task.state,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return Response.json({ error: 'A empresa não está mais disponível no CRM.' }, { status: 404 });
    }
    throw error;
  }
}
