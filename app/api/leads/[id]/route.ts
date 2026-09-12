import { LeadStage } from '@prisma/client';

import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

function isNonNegativeMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: { stage?: unknown; followUpAt?: unknown; saleValue?: unknown; mrr?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados do CRM inválidos.' }, { status: 400 });
  }

  if (typeof body.stage !== 'string' || !Object.values(LeadStage).includes(body.stage as LeadStage)) {
    return Response.json({ error: 'Etapa inválida.' }, { status: 400 });
  }
  const hasSaleValue = Object.prototype.hasOwnProperty.call(body, 'saleValue');
  const hasMrr = Object.prototype.hasOwnProperty.call(body, 'mrr');
  const saleValue = body.saleValue;
  const mrr = body.mrr;
  let validSaleValue: number | undefined;
  let validMrr: number | undefined;
  if (hasSaleValue) {
    if (!isNonNegativeMoney(saleValue)) return Response.json({ error: 'Valores monetários devem ser não negativos.' }, { status: 400 });
    validSaleValue = saleValue;
  }
  if (hasMrr) {
    if (!isNonNegativeMoney(mrr)) return Response.json({ error: 'Valores monetários devem ser não negativos.' }, { status: 400 });
    validMrr = mrr;
  }
  let dueDate: Date | undefined;
  if (body.followUpAt !== undefined) {
    dueDate = new Date(String(body.followUpAt));
    if (Number.isNaN(dueDate.valueOf())) return Response.json({ error: 'Data de retorno inválida.' }, { status: 400 });
  }

  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return Response.json({ error: 'Lead não encontrado.' }, { status: 404 });

  const updatedLead = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id },
      data: {
        stage: body.stage as LeadStage,
        ...(validSaleValue !== undefined ? { saleValue: validSaleValue } : {}),
        ...(validMrr !== undefined ? { mrr: validMrr } : {})
      }
    });
    await tx.activity.create({
      data: { leadId: id, actorId: user.id, channel: 'OTHER', note: `Etapa alterada para ${body.stage}.` }
    });
    if (dueDate) {
      await tx.followUp.create({
        data: { leadId: id, dueDate, ownerId: user.id, note: 'Retorno agendado pelo CRM.' }
      });
    }
    return updated;
  });

  return Response.json({ lead: updatedLead });
}
