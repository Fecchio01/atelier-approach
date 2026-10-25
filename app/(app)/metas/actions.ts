'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { parseCustomGoalMetrics } from '@/lib/custom-goals';
import { removePdfImportedCustomGoals, removeRedundantCustomGoals } from '@/lib/goal-import-state';
import { parseGoalTargets, type GoalTargetFormValues } from '@/lib/goal-input';
import { getGoalPeriodWindow, getLocalDayOfMonth, getManualGoalPeriodWindowAfterClose, type GoalPeriodKind, type GoalPeriodWindow } from '@/lib/goal-periods';
import { saveMonthlyStartDay, upsertTeamGoal, type GoalMetricKey } from '@/lib/metrics';
import { prisma } from '@/lib/db';
import type { GoalActionState } from './goal-form-state';

const metricKeys: GoalMetricKey[] = ['approaches', 'interests', 'meetings', 'proposalsSent', 'sales', 'revenue', 'mrr', 'followUpsCompleted', 'conversionRate'];
const teamOwnerId = '__team__';

async function getActiveGoalPeriod(kind: GoalPeriodKind, now: Date, database: typeof prisma | Prisma.TransactionClient = prisma) {
  return database.goal.findFirst({
    where: {
      ownerId: teamOwnerId,
      periodKind: kind,
      periodStart: { lte: now },
      periodEnd: { gt: now }
    },
    orderBy: { periodStart: 'desc' }
  });
}

function targetsFromForm(formData: FormData): GoalTargetFormValues {
  return Object.fromEntries(metricKeys.map((key) => [key, formData.get(key)?.toString() ?? '']));
}

function customGoalsFromForm(formData: FormData) {
  if (!formData.has('customGoals')) return { ok: true as const, goals: undefined };
  const parsed = parseCustomGoalMetrics(formData.get('customGoals')?.toString() ?? '');
  return parsed.ok ? { ...parsed, goals: removeRedundantCustomGoals(parsed.goals) } : parsed;
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
    await prisma.$transaction(async (transaction) => {
      const activeGoal = await getActiveGoalPeriod('WEEKLY', now, transaction);
      const period = activeGoal
        ? { kind: 'WEEKLY' as const, start: activeGoal.periodStart, end: activeGoal.periodEnd }
        : getGoalPeriodWindow('WEEKLY', now, 1);
      await upsertTeamGoal(period, parsed.targets, transaction, parsedCustomGoals.goals);
    });
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
    const cleanCustomGoals = removeRedundantCustomGoals(parsedCustomGoals.goals);

    const now = new Date();
    await prisma.$transaction(async (transaction) => {
      const activeGoal = await getActiveGoalPeriod(kind, now, transaction);
      const settings = kind === 'MONTHLY'
        ? await transaction.teamGoalSettings.findUnique({ where: { id: 'team' } })
        : null;
      const period: GoalPeriodWindow = activeGoal
        ? { kind, start: activeGoal.periodStart, end: activeGoal.periodEnd }
        : getGoalPeriodWindow(kind, now, settings?.monthlyStartDay ?? 1);
      const unique = { ownerId: teamOwnerId, periodKind: kind, periodStart: period.start };
      await transaction.goal.upsert({
        where: { ownerId_periodKind_periodStart: unique },
        create: { ...unique, periodEnd: period.end, customGoals: cleanCustomGoals as Prisma.InputJsonValue },
        update: { periodEnd: period.end, customGoals: cleanCustomGoals as Prisma.InputJsonValue }
      });
    });

    await revalidateGoals();
    return { status: 'saved', message: 'Indicador salvo automaticamente neste ciclo.' };
  } catch {
    return { status: 'error', message: 'Não foi possível salvar o indicador agora. Ele continua no formulário; tente novamente.' };
  }
}

export async function removeRedundantGoalsFromCycle(kind: 'WEEKLY' | 'MONTHLY'): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para ajustar as metas.' };
    if (kind !== 'WEEKLY' && kind !== 'MONTHLY') return { status: 'error', message: 'Escolha um ciclo válido para ajustar as metas.' };

    const now = new Date();
    const activeGoal = await getActiveGoalPeriod(kind, now);

    if (!activeGoal) return { status: 'saved', message: 'Este ciclo não tem indicadores personalizados redundantes.' };
    const parsed = parseCustomGoalMetrics(activeGoal.customGoals);
    if (!parsed.ok) return { status: 'error', message: parsed.message };
    const cleaned = removeRedundantCustomGoals(parsed.goals);
    if (cleaned.length === parsed.goals.length) return { status: 'saved', message: 'Os indicadores deste ciclo já estão organizados.' };

    await prisma.goal.update({ where: { id: activeGoal.id }, data: { customGoals: cleaned as Prisma.InputJsonValue } });
    await revalidateGoals();
    return { status: 'saved', message: 'Indicadores redundantes removidos; os demais e as metas padrão foram preservados.' };
  } catch {
    return { status: 'error', message: 'Não foi possível limpar os indicadores redundantes agora.' };
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
    const activeGoal = await getActiveGoalPeriod(kind, now);

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

export async function closeGoalCycle(kind: GoalPeriodKind): Promise<GoalActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { status: 'error', message: 'Entre no sistema para encerrar o ciclo.' };
    if (kind !== 'WEEKLY' && kind !== 'MONTHLY') return { status: 'error', message: 'Escolha um ciclo válido para encerrar.' };

    const closedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      const settings = await transaction.teamGoalSettings.findUnique({ where: { id: 'team' } });
      const configuredMonthlyStartDay = settings?.monthlyStartDay ?? 1;
      const configuredWindow = getGoalPeriodWindow(kind, closedAt, configuredMonthlyStartDay);
      const activeGoal = await getActiveGoalPeriod(kind, closedAt, transaction);
      const previousWindow = activeGoal
        ? { kind, start: activeGoal.periodStart, end: activeGoal.periodEnd }
        : configuredWindow;

      if (closedAt <= previousWindow.start) throw new RangeError('O ciclo ainda não tem duração para ser encerrado.');

      const goalAtStart = activeGoal ?? await transaction.goal.findUnique({
        where: {
          ownerId_periodKind_periodStart: {
            ownerId: teamOwnerId,
            periodKind: kind,
            periodStart: previousWindow.start
          }
        }
      });
      if (goalAtStart) {
        await transaction.goal.update({ where: { id: goalAtStart.id }, data: { periodEnd: closedAt } });
      } else {
        await transaction.goal.create({
          data: {
            ownerId: teamOwnerId,
            periodKind: kind,
            periodStart: previousWindow.start,
            periodEnd: closedAt,
            customGoals: []
          }
        });
      }

      const importedBatches = await transaction.metricImportBatch.findMany({
        where: { ownerId: teamOwnerId, periodStart: previousWindow.start, periodEnd: previousWindow.end },
        select: { id: true, contentHash: true }
      });
      for (const batch of importedBatches) {
        const duplicate = await transaction.metricImportBatch.findFirst({
          where: {
            ownerId: teamOwnerId,
            contentHash: batch.contentHash,
            periodStart: previousWindow.start,
            periodEnd: closedAt,
            id: { not: batch.id }
          },
          select: { id: true }
        });
        if (duplicate) await transaction.metricImportBatch.delete({ where: { id: duplicate.id } });
        await transaction.metricImportBatch.update({ where: { id: batch.id }, data: { periodEnd: closedAt } });
      }

      const monthlyStartDay = kind === 'MONTHLY' ? getLocalDayOfMonth(closedAt) : configuredMonthlyStartDay;
      if (kind === 'MONTHLY') await saveMonthlyStartDay(monthlyStartDay, transaction);
      const nextWindow = getManualGoalPeriodWindowAfterClose(kind, closedAt, monthlyStartDay);
      await transaction.goal.create({
        data: {
          ownerId: teamOwnerId,
          periodKind: kind,
          periodStart: closedAt,
          periodEnd: nextWindow.end,
          customGoals: []
        }
      });
    });

    await revalidateGoals();
    return {
      status: 'saved',
      message: kind === 'WEEKLY'
        ? 'Ciclo semanal encerrado. As metas e os resultados foram arquivados; o novo ciclo está zerado.'
        : 'Ciclo mensal encerrado. As metas e os resultados foram arquivados; o novo ciclo começa hoje e vira no mesmo dia do próximo mês.'
    };
  } catch {
    return { status: 'error', message: 'Não foi possível encerrar o ciclo agora. Tente novamente.' };
  }
}
