'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth';
import { parseCustomGoalMetrics } from '@/lib/custom-goals';
import { parseGoalTargets, type GoalTargetFormValues } from '@/lib/goal-input';
import { getGoalPeriodWindow } from '@/lib/goal-periods';
import { saveMonthlyStartDay, upsertTeamGoal, type GoalMetricKey } from '@/lib/metrics';
import { prisma } from '@/lib/db';
import type { GoalActionState } from './goal-form-state';

const metricKeys: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'];
const teamOwnerId = '__team__';

function targetsFromForm(formData: FormData): GoalTargetFormValues {
  return Object.fromEntries(metricKeys.map((key) => [key, formData.get(key)?.toString() ?? '']));
}

function customGoalsFromForm(formData: FormData) {
  if (!formData.has('customGoals')) return { ok: true as const, goals: undefined };
  return parseCustomGoalMetrics(formData.get('customGoals')?.toString() ?? '');
}

async function revalidateGoals() {
  revalidatePath('/');
  revalidatePath('/metas');
  revalidatePath('/relatorios');
}

export async function saveWeeklyGoal(_previous: GoalActionState, formData: FormData): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para salvar a meta.' };

    const parsed = parseGoalTargets(targetsFromForm(formData));
    if (!parsed.ok) return { status: 'error', message: parsed.message };
    const parsedCustomGoals = customGoalsFromForm(formData);
    if (!parsedCustomGoals.ok) return { status: 'error', message: parsedCustomGoals.message };

    const now = new Date();
    const period = getGoalPeriodWindow('WEEKLY', now, 1);
    await upsertTeamGoal(period, parsed.targets, undefined, parsedCustomGoals.goals);
    await revalidateGoals();
    return { status: 'saved', message: 'Meta semanal da equipe salva.' };
  } catch {
    return { status: 'error', message: 'Não foi possível salvar agora. Os valores continuam no formulário; tente novamente.' };
  }
}

export async function saveMonthlyGoal(_previous: GoalActionState, formData: FormData): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para salvar a meta.' };

    const parsed = parseGoalTargets(targetsFromForm(formData));
    if (!parsed.ok) return { status: 'error', message: parsed.message };
    const parsedCustomGoals = customGoalsFromForm(formData);
    if (!parsedCustomGoals.ok) return { status: 'error', message: parsedCustomGoals.message };

    const monthlyStartDay = Number(formData.get('monthlyStartDay'));
    if (!Number.isInteger(monthlyStartDay) || monthlyStartDay < 1 || monthlyStartDay > 31) {
      return { status: 'error', message: 'Escolha um dia de início entre 1 e 31.' };
    }

    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      const settings = await transaction.teamGoalSettings.findUnique({ where: { id: 'team' } });
      const currentGoal = await transaction.goal.findFirst({
        where: {
          ownerId: teamOwnerId,
          periodKind: 'MONTHLY',
          periodStart: { lte: now },
          periodEnd: { gt: now }
        },
        orderBy: { periodStart: 'desc' }
      });
      const previousWindow = settings
        ? getGoalPeriodWindow('MONTHLY', now, settings.monthlyStartDay)
        : undefined;
      const activeStart = currentGoal?.periodStart ?? previousWindow?.start;
      const period = getGoalPeriodWindow('MONTHLY', now, monthlyStartDay, activeStart);

      await saveMonthlyStartDay(monthlyStartDay, transaction);
      await upsertTeamGoal(period, parsed.targets, transaction, parsedCustomGoals.goals);
    });

    await revalidateGoals();
    return { status: 'saved', message: 'Meta mensal da equipe salva com o ciclo configurado.' };
  } catch {
    return { status: 'error', message: 'Não foi possível salvar agora. Os valores continuam no formulário; tente novamente.' };
  }
}
