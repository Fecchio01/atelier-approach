import { normalizeFunnelStage, stageLabels } from '@/lib/funnel';
import { getLeadLifecycleWarning } from '@/lib/lead-lifecycle';
import { prisma } from '@/lib/db';

export const dashboardLifecycleWarningLimit = 10;

export type DashboardLifecycleWarning = {
  leadId: string;
  leadName: string;
  currentStage: string;
  originStage: string | null;
  discardAt: Date;
  daysRemaining: number;
  remainingTime: string;
};

function getRemainingTime(discardAt: Date, now: Date) {
  const remainingMs = discardAt.getTime() - now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (remainingMs <= 0) {
    const overdueDays = Math.floor(Math.abs(remainingMs) / dayMs);
    return overdueDays === 0 ? 'Prazo vencido há menos de 1 dia' : `Prazo vencido há ${overdueDays} dia${overdueDays === 1 ? '' : 's'}`;
  }
  if (remainingMs < dayMs) return 'Vence em menos de 1 dia';
  const days = Math.ceil(remainingMs / dayMs);
  return `Vence em ${days} dia${days === 1 ? '' : 's'}`;
}

export async function getDashboardLifecycleWarnings(now: Date): Promise<DashboardLifecycleWarning[]> {
  const cutoff = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const leads = await prisma.lead.findMany({
    where: { postFollowUpAt: { lte: cutoff }, stage: { notIn: ['WON', 'DISCARDED'] } },
    orderBy: [{ postFollowUpAt: 'asc' }, { id: 'asc' }],
    take: dashboardLifecycleWarningLimit,
    select: {
      id: true,
      name: true,
      stage: true,
      postFollowUpAt: true,
      followUps: {
        where: { state: 'COMPLETED' },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { returnStage: true }
      }
    }
  });

  return leads.flatMap((lead) => {
    if (!lead.postFollowUpAt) return [];
    const warning = getLeadLifecycleWarning(lead.id, lead.postFollowUpAt, now);
    if (!warning) return [];
    const origin = lead.followUps[0]?.returnStage ?? null;
    return [{
      leadId: lead.id,
      leadName: lead.name ?? 'Lead sem nome',
      currentStage: stageLabels[normalizeFunnelStage(lead.stage)],
      originStage: origin ? stageLabels[normalizeFunnelStage(origin)] : null,
      discardAt: warning.discardAt,
      daysRemaining: warning.daysRemaining,
      remainingTime: getRemainingTime(warning.discardAt, now)
    }];
  });
}
