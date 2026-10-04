import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getFollowUpDelayDays } from '@/lib/commercial-settings';

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  return Response.json({ followUpDelayDays: await getFollowUpDelayDays() });
}

export async function PATCH(request: Request) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const delay = body && typeof body === 'object' && 'followUpDelayDays' in body ? body.followUpDelayDays : undefined;
  if (typeof delay !== 'number' || !Number.isInteger(delay) || delay <= 0 || delay > 2147483647) {
    return Response.json({ error: 'Informe um número inteiro positivo de dias.' }, { status: 400 });
  }
  const settings = await prisma.crmSettings.upsert({ where: { id: 'team' }, create: { id: 'team', followUpDelayDays: delay }, update: { followUpDelayDays: delay } });
  return Response.json({ followUpDelayDays: settings.followUpDelayDays });
}
