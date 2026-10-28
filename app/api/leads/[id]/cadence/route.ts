import { CadenceStatus, CrmTaskState } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { cadencePolicy, getCadenceDueAt } from '@/lib/agents/specialists/follow-up';

const actionSchema = z.object({ action: z.enum(['START', 'PAUSE', 'RESUME', 'CANCEL']) }).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  const enrollment = await prisma.cadenceEnrollment.findUnique({ where: { leadId: id }, include: { lead: { select: { name: true } } } });
  return Response.json({ enrollment });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Ação de cadência inválida.' }, { status: 400 });
  const { id: leadId } = await params;
  const action = parsed.data.action;

  try {
    const enrollment = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error('Empresa não encontrada.');
      const current = await tx.cadenceEnrollment.findUnique({ where: { leadId } });
      if (action === 'START' || action === 'RESUME') {
        if (lead.stage === 'WON' || lead.stage === 'DISCARDED' || lead.stage === 'PROPOSAL' || lead.stage === 'MEETING') throw new Error('A etapa atual exige revisão manual; a cadência não pode ser iniciada.');
        const baseline = lead.lastMeaningfulInteractionAt;
        if (!baseline) throw new Error('Registre primeiro uma abordagem ou interação confirmada no CRM.');
        const recentReply = current ? await tx.messagingMessage.findFirst({ where: { leadId, direction: 'INBOUND', createdAt: { gt: current.lastActivityAt } }, select: { id: true } }) : null;
        if (recentReply) throw new Error('Há resposta registrada. Revise a conversa e inicie uma nova cadência manualmente depois.');
        const nextDueAt = getCadenceDueAt(baseline, cadencePolicy.initialBusinessDays);
        if (current?.activeTaskId) await tx.crmTask.updateMany({ where: { id: current.activeTaskId, state: CrmTaskState.PENDING }, data: { state: CrmTaskState.CANCELLED, cancelledAt: new Date(), cancelledById: user.id } });
        return tx.cadenceEnrollment.upsert({
          where: { leadId },
          create: { leadId, ownerId: user.id, policyVersion: cadencePolicy.version, status: CadenceStatus.ACTIVE, attempt: 0, nextDueAt, lastActivityAt: baseline },
          update: { ownerId: user.id, policyVersion: cadencePolicy.version, status: CadenceStatus.ACTIVE, attempt: 0, nextDueAt, lastActivityAt: baseline, activeTaskId: null, pauseReason: null }
        });
      }
      if (!current) throw new Error('Esta empresa não tem uma cadência ativa.');
      if (action === 'PAUSE') {
        if (current.activeTaskId) await tx.crmTask.updateMany({ where: { id: current.activeTaskId, state: CrmTaskState.PENDING }, data: { state: CrmTaskState.CANCELLED, cancelledAt: new Date(), cancelledById: user.id } });
        return tx.cadenceEnrollment.update({ where: { id: current.id }, data: { status: CadenceStatus.PAUSED, activeTaskId: null, pauseReason: 'Pausada manualmente pela equipe.' } });
      }
      if (action === 'CANCEL') {
        if (current.activeTaskId) await tx.crmTask.updateMany({ where: { id: current.activeTaskId, state: CrmTaskState.PENDING }, data: { state: CrmTaskState.CANCELLED, cancelledAt: new Date(), cancelledById: user.id } });
        return tx.cadenceEnrollment.update({ where: { id: current.id }, data: { status: CadenceStatus.CANCELLED, activeTaskId: null, pauseReason: 'Encerrada manualmente pela equipe.' } });
      }
      throw new Error('Ação não disponível.');
    });
    return Response.json({ enrollment });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível atualizar a cadência.' }, { status: 409 });
  }
}
