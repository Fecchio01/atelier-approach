import { Channel } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeContact } from '@/lib/messaging/suppression';

const schema = z.object({ channel: z.nativeEnum(Channel), contact: z.string().trim().min(3).max(200), reason: z.string().trim().min(3).max(500) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Informe canal, contato e motivo válidos.' }, { status: 400 });
  const normalizedContact = normalizeContact(parsed.data.contact);
  if (!normalizedContact) return Response.json({ error: 'Contato inválido.' }, { status: 400 });
  const suppression = await prisma.contactSuppression.upsert({
    where: { channel_normalizedContact: { channel: parsed.data.channel, normalizedContact } },
    create: { channel: parsed.data.channel, normalizedContact, reason: parsed.data.reason, createdById: user.id },
    update: { reason: parsed.data.reason, createdById: user.id }
  });
  await prisma.messagingMessage.updateMany({
    where: { channel: parsed.data.channel, recipient: normalizedContact, status: { in: ['DRAFT', 'APPROVED'] } },
    data: { status: 'BLOCKED' }
  });
  return Response.json({ suppression }, { status: 201 });
}
