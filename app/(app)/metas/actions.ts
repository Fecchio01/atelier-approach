'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { parseCustomGoalMetrics } from '@/lib/custom-goals';
import { removePdfImportedCustomGoals } from '@/lib/goal-import-state';
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

export async function saveCustomGoalsForCycle(kind: 'WEEKLY' | 'MONTHLY', customGoalsJson: string): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para salvar o indicador.' };
    if (kind !== 'WEEKLY' && kind !== 'MONTHLY') {
      return { status: 'error', message: 'Escolha um ciclo válido para salvar o indicador.' };
    }

    const parsedCustomGoals = parseCustomGoalMetrics(customGoalsJson);
    if (!parsedCustomGoals.ok) return { status: 'error', message: parsedCustomGoals.message };

    const now = new Date();
    let period = getGoalPeriodWindow('WEEKLY', now, 1);
    if (kind === 'MONTHLY') {
      const [settings, activeGoal] = await Promise.all([
        prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }),
        prisma.goal.findFirst({
          where: {
            ownerId: teamOwnerId,
            periodKind: 'MONTHLY',
            periodStart: { lte: now },
            periodEnd: { gt: now }
          },
          orderBy: { periodStart: 'desc' }
        })
      ]);
      period = getGoalPeriodWindow('MONTHLY', now, settings?.monthlyStartDay ?? 1, activeGoal?.periodStart);
    }

    const unique = { ownerId: teamOwnerId, periodKind: kind, periodStart: period.start };
    await prisma.goal.upsert({
      where: { ownerId_periodKind_periodStart: unique },
      create: { ...unique, periodEnd: period.end, customGoals: parsedCustomGoals.goals as Prisma.InputJsonValue },
      update: { customGoals: parsedCustomGoals.goals as Prisma.InputJsonValue }
    });

    await revalidateGoals();
    return { status: 'saved', message: 'Indicador salvo automaticamente neste ciclo.' };
  } catch {
    return { status: 'error', message: 'Não foi possível salvar o indicador agora. Ele continua no formulário; tente novamente.' };
  }
}

export async function removeImportedPdfGoals(kind: 'WEEKLY' | 'MONTHLY'): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para alterar as metas.' };
    if (kind !== 'WEEKLY' && kind !== 'MONTHLY') {
      return { status: 'error', message: 'Escolha um ciclo válido para alterar as metas.' };
    }

    const now = new Date();
    const activeGoal = kind === 'WEEKLY'
      ? await prisma.goal.findFirst({
        where: {
          ownerId: teamOwnerId,
          periodKind: 'WEEKLY',
          periodStart: getGoalPeriodWindow('WEEKLY', now, 1).start
        }
      })
      : await prisma.goal.findFirst({
        where: {
          ownerId: teamOwnerId,
          periodKind: 'MONTHLY',
          periodStart: { lte: now },
          periodEnd: { gt: now }
        },
        orderBy: { periodStart: 'desc' }
      });

    if (!activeGoal) return { status: 'saved', message: 'Este ciclo não tem metas importadas para remover.' };

    const parsedCustomGoals = parseCustomGoalMetrics(activeGoal.customGoals);
    if (!parsedCustomGoals.ok) return { status: 'error', message: parsedCustomGoals.message };

    const remainingGoals = removePdfImportedCustomGoals(parsedCustomGoals.goals);
    if (remainingGoals.length === parsedCustomGoals.goals.length) {
      return { status: 'saved', message: 'Não há metas do PDF para remover; as metas padrão permanecem.' };
    }

    await prisma.goal.update({
      where: { id: activeGoal.id },
      data: { customGoals: remainingGoals as Prisma.InputJsonValue }
    });
    await revalidateGoals();
    return { status: 'saved', message: 'Metas do PDF removidas. As metas padrão e manuais foram preservadas.' };
  } catch {
    return { status: 'error', message: 'Não foi possível remover as metas do PDF agora. Tente novamente.' };
  }
}
