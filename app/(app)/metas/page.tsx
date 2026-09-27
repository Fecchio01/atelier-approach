import Link from 'next/link';

import { PageHeading } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { GoalForm } from './goal-form';

const teamOwnerId = '__team__';

export default async function GoalsPage() {
  const now = new Date();
  const currentWeek = getGoalPeriodWindow('WEEKLY', now, 1);
  const [settings, goals] = await Promise.all([
    prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }),
    prisma.goal.findMany({
      where: {
        ownerId: teamOwnerId,
        OR: [
          { periodKind: 'WEEKLY', periodStart: currentWeek.start },
          { periodKind: 'MONTHLY', periodStart: { lte: now }, periodEnd: { gt: now } }
        ]
      },
      select: {
        periodKind: true, periodStart: true, periodEnd: true,
        approachesTarget: true, interestsTarget: true, meetingsTarget: true,
        salesTarget: true, revenueTarget: true, mrrTarget: true,
        followUpsCompletedTarget: true, conversionRateTarget: true
      },
      orderBy: { periodStart: 'desc' }
    })
  ]);

  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const weeklyPeriod = getGoalPeriodWindow('WEEKLY', now, monthlyStartDay);
  const savedMonthlyGoal = goals.find((goal) => goal.periodKind === 'MONTHLY' && goal.periodStart <= now && goal.periodEnd > now);
  const monthlyPeriod: GoalPeriodWindow = savedMonthlyGoal
    ? { kind: 'MONTHLY', start: savedMonthlyGoal.periodStart, end: savedMonthlyGoal.periodEnd }
    : getGoalPeriodWindow('MONTHLY', now, monthlyStartDay);
  const weeklyGoal = goals.find((goal) => goal.periodKind === 'WEEKLY' && goal.periodStart.getTime() === weeklyPeriod.start.getTime());

  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8">
    <PageHeading
      eyebrow="Planejamento da equipe"
      title="Metas"
      description="Defina um alvo coletivo para cada período. Os realizados aparecem no painel e nos relatórios; metas pessoais antigas continuam preservadas no histórico."
      action={<Link className="text-sm text-[var(--atelier-green)]" href="/">← Painel</Link>}
    />
    <div className="mt-8 grid gap-6">
      <GoalForm kind="WEEKLY" period={weeklyPeriod} goal={weeklyGoal ?? null} monthlyStartDay={monthlyStartDay} />
      <GoalForm kind="MONTHLY" period={monthlyPeriod} goal={savedMonthlyGoal ?? null} monthlyStartDay={monthlyStartDay} />
    </div>
  </section>;
}
