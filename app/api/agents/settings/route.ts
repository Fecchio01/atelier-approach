import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const settings = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } });
  return Response.json({ settings: settings ?? { id: 'team', paused: false } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = z.object({ paused: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Estado de pausa inválido.' }, { status: 400 });
  const settings = await prisma.agentAutomationSettings.upsert({ where: { id: 'team' }, create: { id: 'team', paused: body.data.paused, updatedBy: user.id }, update: { paused: body.data.paused, updatedBy: user.id } });
  return Response.json({ settings });
}
