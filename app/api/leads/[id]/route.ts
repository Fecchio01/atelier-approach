import { ActivityType, Channel, FollowUpState, LeadStage, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';
import { summarizeServiceItems } from '../../../../lib/service-sales';

type FollowUpAction = 'COMPLETE' | 'CANCEL' | 'RESCHEDULE';

type CrmUpdate = {
  stage?: unknown;
  followUpAt?: unknown;
  followUpAction?: unknown;
  followUpId?: unknown;
  saleValue?: unknown;
  mrr?: unknown;
  serviceIds?: unknown;
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
  const hasFinancials = hasSaleValue || hasMrr;
  const hasServiceIds = Object.prototype.hasOwnProperty.call(body, 'serviceIds');
  if (hasServiceIds && (!Array.isArray(body.serviceIds) || body.serviceIds.some((serviceId) => typeof serviceId !== 'string' || !serviceId.trim()))) {
    return Response.json({ error: 'Seleção de serviços inválida.' }, { status: 400 });
  }
  const serviceIds = hasServiceIds ? body.serviceIds as string[] : undefined;
  if (serviceIds && new Set(serviceIds).size !== serviceIds.length) {
    return Response.json({ error: 'Não selecione o mesmo serviço mais de uma vez.' }, { status: 400 });
  }
  if (serviceIds?.length && hasFinancials) {
    return Response.json({ error: 'Informe os serviços ou os valores manuais, não os dois.' }, { status: 400 });
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

  if (!stage && !followUpAction && !body.activity && !hasFinancials) {
    return Response.json({ error: 'Informe uma atualização para o lead.' }, { status: 400 });
  }

  const { id } = await params;
  const updatedLead = await prisma.$transaction(async (tx) => {
    // Serialize changes to this lead so repeated wins and legacy backfills cannot
    // create two sale events from the same persisted state.
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${id} FOR UPDATE`;
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new Error('LEAD_NOT_FOUND');
    if (stage === 'WON' && lead.stage === 'WON') throw new Error('ALREADY_WON');
    if (hasFinancials && stage !== 'WON' && (lead.stage !== 'WON' || stage)) throw new Error('FINANCIALS_REQUIRE_WON');
    let updated = lead;

    if (stage && stage !== lead.stage) {
      const now = new Date();
      const leadData: Prisma.LeadUpdateInput = { stage };
      let selectedServices: { id: string; name: string; price: Prisma.Decimal; billingType: 'ONE_TIME' | 'MONTHLY' }[] = [];
      if (stage === 'WON') {
        if (serviceIds?.length) {
          selectedServices = await tx.serviceCatalogItem.findMany({ where: { id: { in: serviceIds }, isActive: true } });
          if (selectedServices.length !== serviceIds.length) throw new Error('INVALID_SERVICE_SELECTION');
        }
        const summary = summarizeServiceItems(selectedServices.map(({ price, billingType }) => ({ price: price.toString(), billingType })));
        const saleValue = selectedServices.length
          ? summary.saleValue
          : hasSaleValue ? body.saleValue as number : 0;
        const mrr = selectedServices.length
          ? summary.mrr
          : hasMrr ? body.mrr as number : 0;
        leadData.saleValue = saleValue;
        leadData.mrr = mrr;
        leadData.wonAt = now;
        leadData.wonById = user.id;
      } else if (lead.stage === 'WON') {
        const activeSale = await tx.saleEvent.findFirst({
          where: { leadId: id, reversedAt: null },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]
        });
        if (activeSale) {
          await tx.saleEvent.update({ where: { id: activeSale.id }, data: { reversedAt: now, reversedById: user.id } });
        }
        leadData.saleValue = null;
        leadData.mrr = null;
        leadData.wonAt = null;
        leadData.wonById = null;
      }
      updated = await tx.lead.update({ where: { id }, data: leadData });
      await tx.stageHistory.create({ data: { leadId: id, actorId: user.id, fromStage: lead.stage, toStage: stage } });

      if (stage === 'WON') {
        await tx.saleEvent.create({ data: {
          leadId: id,
          actorId: user.id,
          saleValue: leadData.saleValue as number,
          mrr: leadData.mrr as number,
          occurredAt: now,
          ...(selectedServices.length ? { lineItems: { create: selectedServices.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
            price: service.price,
            billingType: service.billingType
          })) } } : {})
        } });
        await tx.followUp.updateMany({
          where: { leadId: id, state: 'PENDING' },
          data: { state: 'CANCELLED', cancelledAt: now, cancelledById: user.id }
        });
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
      if (lead.stage === 'WON' && stage !== 'WON') {
        await tx.activity.create({ data: { leadId: id, actorId: user.id, type: 'SALE_REVERSED', note: `Negócio reaberto para ${stage}; venda revertida.` } });
      }

    }

    if (hasFinancials && lead.stage === 'WON' && !stage) {
      const sale = await tx.saleEvent.findFirst({ where: { leadId: id, reversedAt: null }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }] });
      const previousSaleValue = Number(sale?.saleValue ?? lead.saleValue ?? 0);
      const previousMrr = Number(sale?.mrr ?? lead.mrr ?? 0);
      const saleValue = hasSaleValue ? body.saleValue as number : previousSaleValue;
      const mrr = hasMrr ? body.mrr as number : previousMrr;
      if (sale) {
        await tx.saleEvent.update({ where: { id: sale.id }, data: { saleValue, mrr } });
      } else {
        await tx.saleEvent.create({ data: { leadId: id, actorId: lead.wonById ?? user.id, occurredAt: lead.wonAt ?? new Date(), saleValue, mrr } });
      }
      updated = await tx.lead.update({ where: { id }, data: { saleValue, mrr } });
      await tx.activity.create({ data: {
        leadId: id, actorId: user.id, type: 'SALE_FINANCIALS_UPDATED',
        note: `Valores da venda atualizados: venda de ${previousSaleValue} para ${saleValue}; MRR de ${previousMrr} para ${mrr}.`
      } });
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
    if (error instanceof Error && ['LEAD_NOT_FOUND', 'ALREADY_WON', 'FINANCIALS_REQUIRE_WON', 'INVALID_SERVICE_SELECTION'].includes(error.message)) return error.message;
    if (error instanceof Error && error.message === 'FOLLOW_UP_NOT_FOUND') return null;
    if (error instanceof Error && error.message === 'FOLLOW_UP_NOT_PENDING') return false;
    throw error;
  });

  if (updatedLead === 'LEAD_NOT_FOUND') return Response.json({ error: 'Lead não encontrado.' }, { status: 404 });
  if (updatedLead === 'ALREADY_WON') return Response.json({ error: 'Este lead já está marcado como ganho. Reabra-o antes de registrar uma nova venda.' }, { status: 409 });
  if (updatedLead === 'FINANCIALS_REQUIRE_WON') return Response.json({ error: 'Os valores financeiros só podem ser alterados em um negócio ganho.' }, { status: 400 });
  if (updatedLead === 'INVALID_SERVICE_SELECTION') return Response.json({ error: 'Um ou mais serviços não existem ou estão arquivados. Nenhuma alteração foi salva.' }, { status: 400 });
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
