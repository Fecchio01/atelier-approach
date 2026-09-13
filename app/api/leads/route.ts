import { Channel, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';

type BusinessInput = {
  osmId?: unknown;
  name?: unknown;
  phone?: unknown;
  website?: unknown;
  instagram?: unknown;
  whatsapp?: unknown;
  address?: unknown;
  category?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: { business?: BusinessInput; channel?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados da abordagem inválidos.' }, { status: 400 });
  }

  const business = body.business;
  const osmId = optionalText(business?.osmId);
  const name = optionalText(business?.name);
  const note = optionalText(body.note);
  const channel = typeof body.channel === 'string' && Object.values(Channel).includes(body.channel as Channel)
    ? body.channel as Channel
    : null;

  if (!osmId || !name || !channel || !note) {
    return Response.json({ error: 'Informe prospect, canal e uma nota da abordagem.' }, { status: 400 });
  }

  try {
    const lead = await prisma.$transaction(async (tx) => {
      const createdLead = await tx.lead.create({
        data: {
          osmId,
          name,
          phone: optionalText(business?.phone),
          website: optionalText(business?.website),
          instagram: optionalText(business?.instagram),
          whatsapp: optionalText(business?.whatsapp),
          address: optionalText(business?.address),
          category: optionalText(business?.category),
          latitude: typeof business?.latitude === 'number' ? business.latitude : null,
          longitude: typeof business?.longitude === 'number' ? business.longitude : null,
          syncedAt: new Date(),
          stage: 'CONTACTED'
        }
      });
      await tx.activity.create({
        data: { leadId: createdLead.id, actorId: user.id, type: 'CONTACT', channel, note }
      });
      await tx.stageHistory.create({
        data: { leadId: createdLead.id, actorId: user.id, fromStage: 'NEW', toStage: 'CONTACTED' }
      });
      return createdLead;
    });
    return Response.json({ lead }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingLead = await prisma.lead.findUnique({ where: { osmId }, select: { id: true } });
      return Response.json(
        { error: 'Esta empresa já está no CRM.', leadId: existingLead?.id, href: existingLead ? `/crm?lead=${existingLead.id}` : '/crm' },
        { status: 409 }
      );
    }
    throw error;
  }
}
