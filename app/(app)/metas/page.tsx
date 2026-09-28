import Link from 'next/link';

import { PageHeading } from '@/components/ui';
import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { getTeamGoalActualsByPeriod } from '@/lib/metrics';
import { GoalCenter } from './goal-center';

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
  const [weeklyActuals, monthlyActuals] = await getTeamGoalActualsByPeriod([weeklyPeriod, monthlyPeriod], now);

  return <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 lg:py-12">
    <PageHeading
      eyebrow="Planejamento da equipe"
      title="Metas da equipe"
      description="Alinhe os objetivos do time por ciclo e acompanhe os resultados no painel e nos relatórios."
      action={<Link className="text-sm text-[var(--atelier-green)] hover:text-[#d1ff8e]" href="/relatorios">Ver relatórios →</Link>}
    />
    <GoalCenter
      weeklyPeriod={weeklyPeriod}
      monthlyPeriod={monthlyPeriod}
      weeklyGoal={weeklyGoal ?? null}
      monthlyGoal={savedMonthlyGoal ?? null}
      monthlyStartDay={monthlyStartDay}
      now={now}
      weeklyActuals={weeklyActuals}
      monthlyActuals={monthlyActuals}
    />
  </section>;
}
