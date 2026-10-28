import { createHmac, timingSafeEqual } from 'node:crypto';
import { MessagingDirection, MessagingStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { normalizeContact } from './suppression';

export const providerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status'), eventId: z.string().min(1).max(200), providerMessageId: z.string().min(1).max(200), status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']) }).strict(),
  z.object({ type: z.literal('inbound'), eventId: z.string().min(1).max(200), sender: z.string().min(3).max(200), content: z.string().max(4000), providerMessageId: z.string().max(200).optional() }).strict()
]);
export type ProviderEvent = z.infer<typeof providerEventSchema>;

export function verifyProviderSignature(rawBody: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const suppliedString = signature.replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(suppliedString)) return false;
  const supplied = Buffer.from(suppliedString, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function processProviderEvent(provider: string, event: ProviderEvent) {
  try {
    return await prisma.$transaction(async (tx) => {
      const saved = await tx.messagingWebhookEvent.create({
        data: { provider, externalEventId: event.eventId, eventType: event.type, payload: JSON.parse(JSON.stringify(event)) }
      });
      if (event.type === 'status') {
        const message = await tx.messagingMessage.findUnique({ where: { provider_providerMessageId: { provider, providerMessageId: event.providerMessageId } }, include: { lead: true } });
        if (message) {
          const status = event.status as MessagingStatus;
          await tx.messagingMessage.update({ where: { id: message.id }, data: { status, ...(status === 'SENT' ? { sentAt: new Date() } : {}) } });
          if (status === 'SENT') await recordConfirmedContact(tx, message.id, message.leadId, message.createdById, message.channel, new Date());
        }
      } else {
        const normalized = normalizeContact(event.sender);
        const priorMessage = await tx.messagingMessage.findFirst({
          where: { provider, direction: MessagingDirection.OUTBOUND, recipient: normalized, status: { in: [MessagingStatus.SENT, MessagingStatus.DELIVERED, MessagingStatus.READ, MessagingStatus.UNKNOWN] } },
          orderBy: { createdAt: 'desc' }, include: { lead: true }
        });
        if (priorMessage) {
          await tx.messagingMessage.create({
            data: {
              leadId: priorMessage.leadId, leadVersion: priorMessage.lead.version, createdById: priorMessage.createdById,
              provider, channel: priorMessage.channel, direction: MessagingDirection.INBOUND, status: MessagingStatus.DELIVERED,
              idempotencyKey: `${provider}:inbound:${event.eventId}`, recipient: normalized,
              providerMessageId: event.providerMessageId ?? null, content: event.content
            }
          });
          await tx.lead.update({ where: { id: priorMessage.leadId }, data: { lastMeaningfulInteractionAt: new Date(), version: { increment: 1 } } });
          await tx.messagingMessage.updateMany({
            where: { leadId: priorMessage.leadId, direction: MessagingDirection.OUTBOUND, status: { in: [MessagingStatus.DRAFT, MessagingStatus.APPROVED] } },
            data: { status: MessagingStatus.CANCELLED }
          });
        }
      }
      await tx.messagingWebhookEvent.update({ where: { id: saved.id }, data: { processedAt: new Date() } });
      return { duplicate: false, processed: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { duplicate: true, processed: true };
    throw error;
  }
}

async function recordConfirmedContact(tx: Prisma.TransactionClient, messageId: string, leadId: string, actorId: string, channel: string, sentAt: Date) {
  await tx.activity.upsert({
    where: { effectKey: `messaging:${messageId}:contact` },
    create: { leadId, actorId, origin: 'SYSTEM', type: 'CONTACT', channel: channel as never, note: 'Contato confirmado pelo provedor de mensagens.', effectKey: `messaging:${messageId}:contact` },
    update: {}
  });
  await tx.lead.update({ where: { id: leadId }, data: { lastMeaningfulInteractionAt: sentAt, version: { increment: 1 } } });
}
