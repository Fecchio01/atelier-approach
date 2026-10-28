import type { Channel } from '@prisma/client';

import { prisma } from '@/lib/db';

export function normalizeContact(value: string) {
  const trimmed = value.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return trimmed.toLowerCase();
  return trimmed.replace(/\D/g, '');
}

export async function isContactSuppressed(channel: Channel, contact: string) {
  const normalizedContact = normalizeContact(contact);
  if (!normalizedContact) return true;
  return Boolean(await prisma.contactSuppression.findUnique({ where: { channel_normalizedContact: { channel, normalizedContact } }, select: { id: true } }));
}
