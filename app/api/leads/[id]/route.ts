import { ActivityType, Channel, FollowUpState, LeadStage, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';

type CrmUpdate = {
  stage?: unknown;
  followUpAt?: unknown;
  followUpAction?: unknown;
  followUpId?: unknown;
  saleValue?: unknown;
  mrr?: unknown;
  activity?: { channel?: unknown; note?: unknown };
};

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isNonNegativeMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseDueDate(value: unknown) {
  if (value === undefined) return undefined;
  const dueDate = new Date(String(value));
  return Number.isNaN(dueDate.valueOf()) ? null : dueDate;
}

function isFollowUpAction(value: unknown): value is FollowUpAction {
  return value === 'COMPLETE' || value === 'CANCEL' || value === 'RESCHEDULE';
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: CrmUpdate;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados do CRM inválidos.' }, { status: 400 });
  }

  const hasStage = Object.prototype.hasOwnProperty.call(body, 'stage');
  const stage = typeof body.stage === 'string' && body.stage !== 'NEW' && Object.values(LeadStage).includes(body.stage as LeadStage)
    ? body.stage as LeadStage
    : undefined;
  if (hasStage && !stage) return Response.json({ error: 'Etapa inválida.' }, { status: 400 });

  const hasSaleValue = Object.prototype.hasOwnProperty.call(body, 'saleValue');
  const hasMrr = Object.prototype.hasOwnProperty.call(body, 'mrr');
  if ((hasSaleValue && !isNonNegativeMoney(body.saleValue)) || (hasMrr && !isNonNegativeMoney(body.mrr))) {
    return Response.json({ error: 'Valores monetários devem ser não negativos.' }, { status: 400 });
  }
  if (stage === 'WON' && (!hasSaleValue || !hasMrr || !isNonNegativeMoney(body.saleValue) || !isNonNegativeMoney(body.mrr))) {
    return Response.json({ error: 'Informe o valor da venda e o MRR para fechar o negócio.' }, { status: 400 });
  }

  const followUpAction = body.followUpAction;
  if (followUpAction !== undefined && !isFollowUpAction(followUpAction)) {
    return Response.json({ error: 'Ação de follow-up inválida.' }, { status: 400 });
  }
  const followUpId = optionalText(body.followUpId);
  if (followUpAction && !followUpId) return Response.json({ error: 'Informe o follow-up a ser atualizado.' }, { status: 400 });

  const dueDate = parseDueDate(body.followUpAt);
  if (dueDate === null) return Response.json({ error: 'Data de retorno inválida.' }, { status: 400 });
  if ((stage === 'FOLLOW_UP' || followUpAction === 'RESCHEDULE') && !dueDate) {
    return Response.json({ error: 'Informe a data e hora do follow-up.' }, { status: 400 });
  }

  const activityNote = optionalText(body.activity?.note);
  const activityChannel = typeof body.activity?.channel === 'string' && Object.values(Channel).includes(body.activity.channel as Channel)
    ? body.activity.channel as Channel
    : undefined;
  if (body.activity && (!activityNote || !activityChannel)) {
    return Response.json({ error: 'Informe canal e nota da atividade.' }, { status: 400 });
  }

  if (!stage && !followUpAction && !body.activity) {
    return Response.json({ error: 'Informe uma atualização para o lead.' }, { status: 400 });
  }

  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return Response.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (stage === 'WON' && lead.stage === 'WON') {
    return Response.json({ error: 'Este lead já está marcado como ganho. Reabra-o antes de registrar uma nova venda.' }, { status: 409 });
  }

  const updatedLead = await prisma.$transaction(async (tx) => {
    let updated = lead;

    if (stage && stage !== lead.stage) {
      const now = new Date();
      const leadData: Prisma.LeadUpdateInput = { stage };
      if (stage === 'WON') {
        leadData.saleValue = body.saleValue as number;
        leadData.mrr = body.mrr as number;
        leadData.wonAt = now;
        leadData.wonById = user.id;
      } else if (lead.stage === 'WON') {
        leadData.saleValue = null;
        leadData.mrr = null;
        leadData.wonAt = null;
        leadData.wonById = null;
      }
      updated = await tx.lead.update({ where: { id }, data: leadData });
      await tx.stageHistory.create({ data: { leadId: id, actorId: user.id, fromStage: lead.stage, toStage: stage } });

      if (stage === 'WON') {
        await tx.saleEvent.create({ data: { leadId: id, actorId: user.id, saleValue: body.saleValue as number, mrr: body.mrr as number, occurredAt: now } });
      }
      const type: ActivityType = stage === 'WON'
        ? 'SALE_WON'
        : lead.stage === 'WON'
          ? 'LEAD_REOPENED'
          : stage === 'DISCARDED'
            ? 'DISCARDED'
            : 'STAGE_CHANGE';
      const note = stage === 'DISCARDED'
        ? 'Lead descartado.'
        : stage === 'WON'
          ? 'Negócio fechado.'
          : lead.stage === 'WON'
            ? `Lead reaberto para ${stage}.`
            : `Etapa alterada para ${stage}.`;
      await tx.activity.create({ data: { leadId: id, actorId: user.id, type, note } });

    }

    if (stage === 'FOLLOW_UP' && dueDate && !followUpAction) {
      const now = new Date();
      await tx.followUp.updateMany({
        where: { leadId: id, state: 'PENDING' },
        data: { state: 'CANCELLED', cancelledAt: now, cancelledById: user.id }
      });
      await tx.followUp.create({ data: { leadId: id, dueDate, ownerId: user.id, note: 'Retorno agendado pelo CRM.' } });
      await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'FOLLOW_UP_SCHEDULED', note: 'Follow-up agendado.' } });
    }

    if (followUpAction && followUpId) {
      const followUp = await tx.followUp.findFirst({ where: { id: followUpId, leadId: id } });
      if (!followUp) throw new Error('FOLLOW_UP_NOT_FOUND');
      if (followUp.state !== FollowUpState.PENDING) throw new Error('FOLLOW_UP_NOT_PENDING');
      const now = new Date();
      if (followUpAction === 'COMPLETE') {
        await tx.followUp.update({ where: { id: followUpId }, data: { state: 'COMPLETED', completedAt: now, completedById: user.id } });
        await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'FOLLOW_UP_COMPLETED', note: 'Follow-up concluído.' } });
      } else {
        await tx.followUp.update({ where: { id: followUpId }, data: { state: 'CANCELLED', cancelledAt: now, cancelledById: user.id } });
        await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'FOLLOW_UP_CANCELLED', note: followUpAction === 'RESCHEDULE' ? 'Follow-up reagendado.' : 'Follow-up cancelado.' } });
        if (followUpAction === 'RESCHEDULE' && dueDate) {
          await tx.followUp.create({ data: { leadId: id, dueDate, ownerId: user.id, note: 'Retorno reagendado pelo CRM.' } });
          await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'FOLLOW_UP_SCHEDULED', note: 'Novo follow-up agendado.' } });
        }
      }
    }

    if (activityNote && activityChannel) {
      await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'CONTACT', channel: activityChannel, note: activityNote } });
    }
    return updated;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === 'FOLLOW_UP_NOT_FOUND') return null;
    if (error instanceof Error && error.message === 'FOLLOW_UP_NOT_PENDING') return false;
    throw error;
  });

  if (updatedLead === null) return Response.json({ error: 'Follow-up não encontrado para este lead.' }, { status: 404 });
  if (updatedLead === false) return Response.json({ error: 'Este follow-up já foi encerrado.' }, { status: 409 });
  return Response.json({ lead: updatedLead });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { id } = await params;
  const deleted = await prisma.lead.deleteMany({ where: { id } });
  if (deleted.count === 0) return Response.json({ error: 'Lead não encontrado.' }, { status: 404 });

  return Response.json({ success: true });
}
