import { createHash } from 'node:crypto';
import { Channel, MessagingDirection, MessagingStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { getMessagingProvider, type MessagingProvider } from './provider';
import { normalizeContact } from './suppression';

export async function createMessageDraft(input: { leadId: string; channel: Channel; recipient: string; content: string; idempotencyKey: string }, actorId: string) {
  const provider = getMessagingProvider();
  const normalized = normalizeContact(input.recipient);
  if (!normalized || !input.content.trim() || input.content.length > 4000 || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 128) throw new Error('Rascunho inválido.');
  if (input.channel !== Channel.WHATSAPP && input.channel !== Channel.PHONE) throw new Error('Canal não habilitado para mensagens integradas.');
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { id: true, version: true, stage: true, phone: true, whatsapp: true } });
  if (!lead || lead.stage === 'WON' || lead.stage === 'DISCARDED') throw new Error('Empresa indisponível para contato.');
  const actualContacts = [lead.whatsapp, lead.phone].filter((value): value is string => Boolean(value)).map(normalizeContact);
  if (!actualContacts.includes(normalized)) throw new Error('O destinatário precisa corresponder ao contato salvo no CRM.');
  const suppressed = await prisma.contactSuppression.findUnique({ where: { channel_normalizedContact: { channel: input.channel, normalizedContact: normalized } } });
  if (suppressed) throw new Error('Este contato está na lista de supressão.');
  return prisma.messagingMessage.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      leadId: lead.id, provider: provider?.name ?? 'unconfigured', channel: input.channel, direction: MessagingDirection.OUTBOUND,
      status: MessagingStatus.DRAFT, idempotencyKey: input.idempotencyKey, recipient: normalized, content: input.content.trim(), leadVersion: lead.version, createdById: actorId
    },
    update: {}
  });
}

export async function approveMessage(messageId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const message = await tx.messagingMessage.findUnique({ where: { id: messageId }, include: { lead: true } });
    if (!message || message.direction !== MessagingDirection.OUTBOUND || message.status !== MessagingStatus.DRAFT) throw new Error('Rascunho não disponível para aprovação.');
    if (message.lead.version !== message.leadVersion || message.lead.stage === 'WON' || message.lead.stage === 'DISCARDED') throw new Error('A empresa mudou; revise o rascunho antes de aprovar.');
    const suppression = await tx.contactSuppression.findUnique({ where: { channel_normalizedContact: { channel: message.channel, normalizedContact: normalizeContact(message.recipient) } } });
    if (suppression) throw new Error('Este contato está na lista de supressão.');
    return tx.messagingMessage.update({ where: { id: message.id }, data: { status: MessagingStatus.APPROVED, approvedById: actorId, approvedAt: new Date() } });
  });
}

export async function sendApprovedMessage(input: { messageId: string; provider?: MessagingProvider }) {
  const provider = input.provider ?? getMessagingProvider();
  if (!provider) {
    await prisma.messagingMessage.updateMany({ where: { id: input.messageId, status: MessagingStatus.APPROVED }, data: { status: MessagingStatus.BLOCKED } });
    return { status: 'BLOCKED' as const, reason: 'Envio desabilitado: configure um provedor empresarial e credenciais no servidor.' };
  }
  const message = await prisma.$transaction(async (tx) => {
    const current = await tx.messagingMessage.findUnique({ where: { id: input.messageId }, include: { lead: true } });
    if (!current || current.status !== MessagingStatus.APPROVED) throw new Error('Mensagem não aprovada ou já processada.');
    if (current.channel !== provider.channel || current.lead.version !== current.leadVersion || current.lead.stage === 'WON' || current.lead.stage === 'DISCARDED') {
      await tx.messagingMessage.update({ where: { id: current.id }, data: { status: MessagingStatus.BLOCKED } });
      throw new Error('A mensagem ficou inelegível; revise a empresa e aprove novamente.');
    }
    const suppression = await tx.contactSuppression.findUnique({ where: { channel_normalizedContact: { channel: current.channel, normalizedContact: normalizeContact(current.recipient) } } });
    if (suppression) {
      await tx.messagingMessage.update({ where: { id: current.id }, data: { status: MessagingStatus.BLOCKED } });
      throw new Error('O contato está suprimido; nenhum envio foi feito.');
    }
    const reserved = await tx.messagingMessage.updateMany({ where: { id: current.id, status: MessagingStatus.APPROVED }, data: { status: MessagingStatus.SENDING } });
    if (reserved.count !== 1) throw new Error('Outro processo já reservou esta mensagem.');
    return current;
  });

  try {
    const sent = await provider.send({ recipient: message.recipient, content: message.content, idempotencyKey: message.idempotencyKey });
    await prisma.$transaction(async (tx) => {
      const updated = await tx.messagingMessage.update({ where: { id: message.id }, data: { status: MessagingStatus.SENT, provider: provider.name, providerMessageId: sent.providerMessageId, sentAt: sent.acceptedAt } });
      await tx.activity.upsert({
        where: { effectKey: `messaging:${updated.id}:contact` },
        create: { leadId: message.leadId, actorId: message.approvedById ?? 'system:messaging', origin: 'SYSTEM', type: 'CONTACT', channel: message.channel, note: 'Contato confirmado pelo provedor de mensagens.', effectKey: `messaging:${updated.id}:contact` },
        update: {}
      });
      await tx.lead.update({ where: { id: message.leadId }, data: { lastMeaningfulInteractionAt: sent.acceptedAt, version: { increment: 1 } } });
    });
    return { status: 'SENT' as const, providerMessageId: sent.providerMessageId };
  } catch (error) {
    // Provider timeouts have unknown outcome. Never retry blindly.
    await prisma.messagingMessage.updateMany({ where: { id: message.id, status: MessagingStatus.SENDING }, data: { status: MessagingStatus.UNKNOWN } });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw error;
    return { status: 'UNKNOWN' as const, reason: 'Resultado do envio desconhecido; reconcilie no provedor antes de qualquer repetição.' };
  }
}
