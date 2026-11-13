import { processCrmLifecycleForPageRequest } from '../../../../lib/crm-lifecycle-page-request';
import { createDarwinGoalSuggestions } from '@/lib/agents/goal-planner';
import { closeDailyReportForDate } from '@/lib/daily-reports';
import { getLocalDayWindow } from '@/lib/goal-periods';

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = getLocalDayWindow(now);
    const previousDayReference = new Date(today.start.getTime() - 1);
    let dailyReportArchived = false;
    try {
      const archived = await closeDailyReportForDate(previousDayReference, 'system:darwin-daily-close', now);
      dailyReportArchived = archived.created;
    } catch (error) {
      console.error('[api/cron/crm-lifecycle] Could not archive previous daily report', error);
    }
    const result = await processCrmLifecycleForPageRequest();
    let goals = { weekly: false, monthly: false };
    try {
      goals = await createDarwinGoalSuggestions(now);
    } catch (error) {
      console.error('[api/cron/crm-lifecycle] Could not create goal suggestions', error);
    }
    return Response.json({
      movedToFollowUp: result.movedToFollowUp,
      discardedForInactivity: result.discardedForInactivity,
      permanentlyDeleted: result.permanentlyDeleted,
      dailyReportArchived,
      goalsCreated: { weekly: goals.weekly, monthly: goals.monthly }
    });
  } catch {
    console.error('[api/cron/crm-lifecycle] Processing failed');
    return Response.json({ error: 'Lifecycle processing failed' }, { status: 500 });
  }
}
