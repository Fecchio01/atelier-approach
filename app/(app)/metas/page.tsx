import Link from 'next/link';

import { PageHeading } from '@/components/ui';
import { parseCustomGoalMetrics } from '@/lib/custom-goals';
import { prisma } from '@/lib/db';
import { getGoalPeriodWindow, type GoalPeriodWindow } from '@/lib/goal-periods';
import { getTeamGoalActualsByPeriod } from '@/lib/metrics';
import { GoalCenter } from './goal-center';

export const dynamic = 'force-dynamic';

const teamOwnerId = '__team__';

export default async function GoalsPage() {
  const now = new Date();
  const currentWeek = getGoalPeriodWindow('WEEKLY', now, 1);
  const settings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });
  const goals = await prisma.goal.findMany({
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
      followUpsCompletedTarget: true, conversionRateTarget: true, customGoals: true
    },
    orderBy: { periodStart: 'desc' }
  });

  const monthlyStartDay = settings?.monthlyStartDay ?? 1;
  const weeklyPeriod = getGoalPeriodWindow('WEEKLY', now, monthlyStartDay);
  const savedMonthlyGoal = goals.find((goal) => goal.periodKind === 'MONTHLY' && goal.periodStart <= now && goal.periodEnd > now);
  const monthlyPeriod: GoalPeriodWindow = savedMonthlyGoal
    ? { kind: 'MONTHLY', start: savedMonthlyGoal.periodStart, end: savedMonthlyGoal.periodEnd }
    : getGoalPeriodWindow('MONTHLY', now, monthlyStartDay);
  const weeklyGoal = goals.find((goal) => goal.periodKind === 'WEEKLY' && goal.periodStart.getTime() === weeklyPeriod.start.getTime());
  const withParsedCustomGoals = (goal: (typeof goals)[number] | undefined) => {
    if (!goal) return null;
    const parsed = parseCustomGoalMetrics(goal.customGoals);
    return { ...goal, customGoals: parsed.ok ? parsed.goals : [] };
  };
  const [weeklyActuals, monthlyActuals] = await getTeamGoalActualsByPeriod([weeklyPeriod, monthlyPeriod], now);

  return <section className="mx-auto max-w-7xl px-4 py-8 sm:px-5 md:px-8 md:py-10 lg:py-12">
    <PageHeading
      eyebrow="Planejamento da equipe"
      title="Metas da equipe"
      description="Alinhe os objetivos do time por ciclo e acompanhe os resultados no painel e nos relatórios."
      action={<Link className="text-sm text-[var(--atelier-green)] hover:text-[var(--atelier-green-hover)]" href="/relatorios">Ver relatórios →</Link>}
    />
    <GoalCenter
      weeklyPeriod={weeklyPeriod}
      monthlyPeriod={monthlyPeriod}
      weeklyGoal={withParsedCustomGoals(weeklyGoal)}
      monthlyGoal={withParsedCustomGoals(savedMonthlyGoal)}
      monthlyStartDay={monthlyStartDay}
      now={now}
      weeklyActuals={weeklyActuals}
      monthlyActuals={monthlyActuals}
    />
  </section>;
}
