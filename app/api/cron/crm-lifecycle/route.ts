import { timingSafeEqual } from 'node:crypto';

import { prisma } from '../../../../lib/db';
import { processLeadLifecycle, type LifecycleDatabase } from '../../../../lib/process-lead-lifecycle';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Cron não configurado.' }, { status: 401 });
  const authorization = request.headers.get('authorization') ?? '';
  const [scheme, token, ...extra] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token || extra.length > 0) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const expected = Buffer.from(secret);
  const received = Buffer.from(token);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 403 });
  }

  const result = await processLeadLifecycle(prisma as unknown as LifecycleDatabase, new Date());
  return Response.json(result);
}
