import { Channel, Prisma } from '@prisma/client';

import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { normalizePublishedPhone, toWhatsAppHref } from '../../../lib/contact-links';
import { createHumanCrmActor } from '../../../lib/crm/actor';
import { executeCrmCommand, withCrmActivityActor } from '../../../lib/crm/commands';
import { OsmUnavailableError } from '../../../lib/osm';
import type { ExternalBusiness } from '../../../lib/osm';
import { verifyProspectExistence } from '../../../lib/research/search-service';

type BusinessInput = {
  osmId?: unknown;
  source?: unknown;
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

  const submittedBusiness = body.business;
  const osmId = optionalText(submittedBusiness?.osmId);
  const name = optionalText(submittedBusiness?.name);
  const source = optionalText(submittedBusiness?.source);
  const note = optionalText(body.note) ?? 'Abordagem iniciada a partir da pesquisa.';
  const channel = typeof body.channel === 'string' && Object.values(Channel).includes(body.channel as Channel)
    ? body.channel as Channel
    : null;

  if (!osmId || !name || !channel) {
    return Response.json({ error: 'Informe prospect e canal da abordagem.' }, { status: 400 });
  }
  if (source !== 'OpenStreetMap + Overture' || !osmId.startsWith('overture/')) {
    return Response.json({ error: 'Esta empresa não tem confirmação gratuita de existência e não pode ser adicionada ao CRM.' }, { status: 409 });
  }
  if (typeof submittedBusiness?.latitude !== 'number' || !Number.isFinite(submittedBusiness.latitude)
    || Math.abs(submittedBusiness.latitude) > 90
    || typeof submittedBusiness.longitude !== 'number' || !Number.isFinite(submittedBusiness.longitude)
    || Math.abs(submittedBusiness.longitude) > 180) {
    return Response.json({ error: 'Não foi possível confirmar a localização desta empresa.' }, { status: 409 });
  }

  let verifiedBusiness: ExternalBusiness | undefined;
  try {
    [verifiedBusiness] = await verifyProspectExistence([{
      osmId,
      name,
      latitude: submittedBusiness.latitude,
      longitude: submittedBusiness.longitude,
      phone: null,
      website: null,
      instagram: null,
      source: 'Overture'
    }]);
  } catch (error) {
    if (error instanceof OsmUnavailableError) {
      return Response.json({ error: 'A confirmação gratuita de existência está indisponível. Nenhuma empresa foi adicionada.' }, { status: 503 });
    }
    throw error;
  }
  if (!verifiedBusiness) {
    return Response.json({ error: 'Esta empresa não foi encontrada em uma fonte independente gratuita e não pode ser adicionada ao CRM.' }, { status: 409 });
  }

  try {
    const lead = await executeCrmCommand(prisma, createHumanCrmActor(user.id), async (tx, actor) => {
      const createdLead = await tx.lead.create({
        data: {
          osmId,
          name,
          phone: normalizePublishedPhone(optionalText(submittedBusiness?.phone)),
          website: optionalText(submittedBusiness?.website),
          instagram: optionalText(submittedBusiness?.instagram),
          whatsapp: toWhatsAppHref(optionalText(submittedBusiness?.whatsapp))
            ?? toWhatsAppHref(normalizePublishedPhone(optionalText(submittedBusiness?.phone))),
          address: optionalText(submittedBusiness?.address),
          category: optionalText(submittedBusiness?.category),
          latitude: verifiedBusiness.latitude ?? null,
          longitude: verifiedBusiness.longitude ?? null,
          syncedAt: new Date(),
          stage: 'CONTACTED'
        }
      });
      await tx.activity.create({
        data: withCrmActivityActor(actor, { leadId: createdLead.id, type: 'CONTACT', channel, note })
      });
      await tx.stageHistory.create({
        data: { leadId: createdLead.id, actorId: actor.id, fromStage: 'NEW', toStage: 'CONTACTED' }
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
