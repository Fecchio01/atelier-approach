import { processCrmLifecycleForPageRequest } from '../../../../lib/crm-lifecycle-page-request';
import { createDarwinGoalSuggestions } from '@/lib/agents/goal-planner';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processCrmLifecycleForPageRequest();
    let goals = { weekly: false, monthly: false };
    try {
      goals = await createDarwinGoalSuggestions();
    } catch (error) {
      console.error('[api/cron/crm-lifecycle] Could not create goal suggestions', error);
    }
    return Response.json({
      movedToFollowUp: result.movedToFollowUp,
      discardedForInactivity: result.discardedForInactivity,
      permanentlyDeleted: result.permanentlyDeleted,
      goalsCreated: { weekly: goals.weekly, monthly: goals.monthly }
    });
  } catch {
    console.error('[api/cron/crm-lifecycle] Processing failed');
    return Response.json({ error: 'Lifecycle processing failed' }, { status: 500 });
  }
}
