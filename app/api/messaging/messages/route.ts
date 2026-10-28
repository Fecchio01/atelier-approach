import { Channel } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createMessageDraft } from '@/lib/messaging/service';

const draftSchema = z.object({
  leadId: z.string().min(1).max(128),
  channel: z.enum([Channel.WHATSAPP, Channel.PHONE]),
  recipient: z.string().trim().min(3).max(200),
  content: z.string().trim().min(1).max(4000),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export async function GET(request: Request) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const leadId = new URL(request.url).searchParams.get('leadId');
  if (!leadId) return Response.json({ error: 'Informe a empresa.' }, { status: 400 });
  const messages = await prisma.messagingMessage.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 200 });
  return Response.json({ messages });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = draftSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Dados do rascunho inválidos.' }, { status: 400 });
  try {
    const message = await createMessageDraft(body.data, user.id);
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.' }, { status: 409 });
  }
}
