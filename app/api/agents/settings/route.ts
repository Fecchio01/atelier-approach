import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const settings = await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' } });
  return Response.json({ settings: settings ?? { id: 'team', paused: false, prospectingEnabled: true, prospectingDailyLimit: 10, prospectingTime: '09:00' } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body = z.object({
    paused: z.boolean().optional(),
    prospectingEnabled: z.boolean().optional(),
    prospectingDailyLimit: z.number().int().min(1).max(20).optional(),
    prospectingTime: z.string().regex(/^(?:[01]\d|2[0-3]):00$/).optional()
  }).strict().refine((value) => Object.keys(value).length > 0).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Revise as configurações de automação.' }, { status: 400 });
  const currentSettings = body.data.prospectingTime !== undefined
    ? await prisma.agentAutomationSettings.findUnique({ where: { id: 'team' }, select: { prospectingTime: true } })
    : null;
  const timeChanged = body.data.prospectingTime !== undefined
    && body.data.prospectingTime !== (currentSettings?.prospectingTime ?? '09:00');
  const patch = {
    ...body.data,
    updatedBy: user.id,
    ...(timeChanged ? { prospectingTimeUpdatedAt: new Date() } : {})
  };
  const settings = await prisma.agentAutomationSettings.upsert({
    where: { id: 'team' },
    create: { id: 'team', ...patch },
    update: patch
  });
  return Response.json({ settings });
}
