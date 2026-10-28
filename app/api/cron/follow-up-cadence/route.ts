import { processFollowUpCadences } from '@/lib/agents/specialists/follow-up';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await processFollowUpCadences();
    return Response.json(result);
  } catch (error) {
    console.error('[api/cron/follow-up-cadence] Processing failed', error);
    return Response.json({ error: 'Follow-up cadence processing failed' }, { status: 500 });
  }
}
