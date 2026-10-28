import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsertTeamGoal: vi.fn(),
  saveMonthlyStartDay: vi.fn(),
  transaction: vi.fn(),
  goalUpsert: vi.fn(),
  goalFindFirst: vi.fn(),
  settingsFindUnique: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/metrics', () => ({ upsertTeamGoal: mocks.upsertTeamGoal, saveMonthlyStartDay: mocks.saveMonthlyStartDay }));
vi.mock('@/lib/db', () => ({ prisma: {
  $transaction: mocks.transaction,
  goal: { upsert: mocks.goalUpsert, findFirst: mocks.goalFindFirst },
  teamGoalSettings: { findUnique: mocks.settingsFindUnique }
} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveCustomGoalsForCycle, saveMonthlyGoal, saveWeeklyGoal } from '../../app/(app)/metas/actions';
import { initialGoalActionState } from '../../app/(app)/metas/goal-form-state';

describe('team goal actions', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.upsertTeamGoal.mockReset();
    mocks.saveMonthlyStartDay.mockReset();
    mocks.transaction.mockReset();
    mocks.goalUpsert.mockReset();
    mocks.goalFindFirst.mockReset();
    mocks.settingsFindUnique.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: 'team-member' });
    mocks.goalUpsert.mockResolvedValue({ id: 'goal' });
    mocks.goalFindFirst.mockResolvedValue(null);
    mocks.settingsFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (callback) => callback({
      goal: { findFirst: mocks.goalFindFirst, findUnique: vi.fn().mockResolvedValue(null), upsert: mocks.goalUpsert, update: mocks.goalUpsert, create: mocks.goalUpsert },
      teamGoalSettings: { findUnique: mocks.settingsFindUnique, upsert: mocks.saveMonthlyStartDay },
      metricImportBatch: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), delete: vi.fn() }
    } as never));
  });

  test('returns an inline error when authentication lookup fails instead of rejecting', async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error('database unavailable'));

    await expect(saveWeeklyGoal(initialGoalActionState, new FormData())).resolves.toMatchObject({ status: 'error' });
    await expect(saveMonthlyGoal(initialGoalActionState, new FormData())).resolves.toMatchObject({ status: 'error' });
  });

  test('persists automatic custom origins with their stored manual values', async () => {
    const form = new FormData();
    form.set('customGoals', JSON.stringify([{ id: 'crm', name: 'Vendas', target: 5, current: 3, source: 'sales' }]));
    await expect(saveWeeklyGoal(initialGoalActionState, form)).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.upsertTeamGoal).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Object),
      [{ id: 'crm', name: 'Vendas', target: 5, current: 3, source: 'sales' }]);
  });

  test('persists manually added indicators to the active weekly cycle without overwriting its targets', async () => {
    const customGoals = [{ id: 'manual-1', name: 'Parcerias', target: 5, current: 1, source: 'manual', origin: 'manual' }];

    await expect(saveCustomGoalsForCycle('WEEKLY', JSON.stringify(customGoals))).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.goalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_periodKind_periodStart: expect.objectContaining({ ownerId: '__team__', periodKind: 'WEEKLY', periodStart: expect.any(Date) }) },
      create: expect.objectContaining({ ownerId: '__team__', periodKind: 'WEEKLY', customGoals }),
      update: expect.objectContaining({ customGoals })
    }));
    expect(mocks.goalUpsert.mock.calls[0][0].update).not.toHaveProperty('approachesTarget');
  });

  test('persists the manually removed list to the existing monthly cycle', async () => {
    const periodStart = new Date('2026-09-14T03:00:00.000Z');
    const customGoals = [{ id: 'kept', name: 'Parcerias', target: 5, current: 1, origin: 'manual' }];
    mocks.settingsFindUnique.mockResolvedValue({ id: 'team', monthlyStartDay: 14 });
    mocks.goalFindFirst.mockResolvedValue({ periodStart });

    await expect(saveCustomGoalsForCycle('MONTHLY', JSON.stringify(customGoals))).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.goalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_periodKind_periodStart: { ownerId: '__team__', periodKind: 'MONTHLY', periodStart } },
      update: expect.objectContaining({ customGoals })
    }));
  });

  test('allows removing the last manual indicator by saving an empty list', async () => {
    await expect(saveCustomGoalsForCycle('WEEKLY', '[]')).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.goalUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ customGoals: [] }),
      update: expect.objectContaining({ customGoals: [] })
    }));
  });

  test('does not persist manual indicators without an authenticated user', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(saveCustomGoalsForCycle('WEEKLY', '[]')).resolves.toMatchObject({ status: 'error' });
    expect(mocks.goalUpsert).not.toHaveBeenCalled();
  });

  test('does not persist weekly or monthly goals when no user is authenticated', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const monthly = new FormData();
    monthly.set('monthlyStartDay', '14');

    await expect(saveWeeklyGoal(initialGoalActionState, new FormData())).resolves.toMatchObject({ status: 'error' });
    await expect(saveMonthlyGoal(initialGoalActionState, monthly)).resolves.toMatchObject({ status: 'error' });
    expect(mocks.upsertTeamGoal).not.toHaveBeenCalled();
    expect(mocks.saveMonthlyStartDay).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  test('returns inline errors for weekly and monthly persistence failures', async () => {
    mocks.upsertTeamGoal.mockRejectedValue(new Error('write failed'));
    mocks.transaction.mockRejectedValue(new Error('transaction failed'));
    const weekly = new FormData();
    const monthly = new FormData();
    monthly.set('monthlyStartDay', '14');

    await expect(saveWeeklyGoal(initialGoalActionState, weekly)).resolves.toMatchObject({ status: 'error' });
    await expect(saveMonthlyGoal(initialGoalActionState, monthly)).resolves.toMatchObject({ status: 'error' });
  });

  test('returns validation feedback without attempting persistence', async () => {
    const invalid = new FormData();
    invalid.set('conversionRate', '101');

    await expect(saveWeeklyGoal(initialGoalActionState, invalid)).resolves.toMatchObject({ status: 'error' });
    expect(mocks.upsertTeamGoal).not.toHaveBeenCalled();
  });

  test('rejects malformed custom-goal JSON before either cycle is written', async () => {
    const weekly = new FormData();
    weekly.set('customGoals', '{broken');
    const monthly = new FormData();
    monthly.set('monthlyStartDay', '14');
    monthly.set('customGoals', JSON.stringify([{ id: 'x', name: 'Carros', target: -1, current: 0 }]));

    await expect(saveWeeklyGoal(initialGoalActionState, weekly)).resolves.toMatchObject({ status: 'error' });
    await expect(saveMonthlyGoal(initialGoalActionState, monthly)).resolves.toMatchObject({ status: 'error' });
    expect(mocks.upsertTeamGoal).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  test('saves reviewed custom metrics with weekly fixed targets in the same upsert', async () => {
    const form = new FormData();
    form.set('approaches', '20');
    form.set('customGoals', JSON.stringify([{ id: 'car-goal', name: 'Carros', unit: 'veículos', target: 3, current: 1, icon: 'car', group: 'vehicles' }]));

    await expect(saveWeeklyGoal(initialGoalActionState, form)).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.upsertTeamGoal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEEKLY' }),
      expect.objectContaining({ approaches: 20 }),
      expect.any(Object),
      [{ id: 'car-goal', name: 'Carros', unit: 'veículos', target: 3, current: 1, icon: 'car', group: 'vehicles' }]
    );
  });

  test('saves the proposals sent target as a fixed Avanço metric', async () => {
    const form = new FormData();
    form.set('proposalsSent', '5');

    await expect(saveWeeklyGoal(initialGoalActionState, form)).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.upsertTeamGoal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEEKLY' }),
      expect.objectContaining({ proposalsSent: 5 }),
      expect.any(Object),
      undefined
    );
  });

  test('saves monthly custom metrics and cycle settings inside the same transaction', async () => {
    const transaction = {
      goal: { findFirst: vi.fn().mockResolvedValue(null) },
      teamGoalSettings: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    mocks.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));
    const form = new FormData();
    form.set('monthlyStartDay', '14');
    form.set('customGoals', JSON.stringify([{ id: 'car-goal', name: 'Carros', target: 3, current: 1, icon: 'car' }]));

    await expect(saveMonthlyGoal(initialGoalActionState, form)).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.saveMonthlyStartDay).toHaveBeenCalledWith(14, transaction);
    expect(mocks.upsertTeamGoal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'MONTHLY' }),
      expect.any(Object),
      transaction,
      [{ id: 'car-goal', name: 'Carros', target: 3, current: 1, icon: 'car' }]
    );
  });
});
