import { processCrmLifecycleForPageRequest } from '../../../../lib/crm-lifecycle-page-request';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processCrmLifecycleForPageRequest();
    return Response.json({
      movedToFollowUp: result.movedToFollowUp,
      discardedForInactivity: result.discardedForInactivity,
      permanentlyDeleted: result.permanentlyDeleted
    });
  } catch {
    console.error('[api/cron/crm-lifecycle] Processing failed');
    return Response.json({ error: 'Lifecycle processing failed' }, { status: 500 });
  }
}
