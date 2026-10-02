import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsertTeamGoal: vi.fn(),
  saveMonthlyStartDay: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/metrics', () => ({ upsertTeamGoal: mocks.upsertTeamGoal, saveMonthlyStartDay: mocks.saveMonthlyStartDay }));
vi.mock('@/lib/db', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveMonthlyGoal, saveWeeklyGoal } from '../../app/(app)/metas/actions';
import { initialGoalActionState } from '../../app/(app)/metas/goal-form-state';

describe('team goal actions', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.upsertTeamGoal.mockReset();
    mocks.saveMonthlyStartDay.mockReset();
    mocks.transaction.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: 'team-member' });
  });

  test('returns an inline error when authentication lookup fails instead of rejecting', async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error('database unavailable'));

    await expect(saveWeeklyGoal(initialGoalActionState, new FormData())).resolves.toMatchObject({ status: 'error' });
    await expect(saveMonthlyGoal(initialGoalActionState, new FormData())).resolves.toMatchObject({ status: 'error' });
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
    form.set('customGoals', JSON.stringify([{ id: 'car-goal', name: 'Carros', unit: 'veículos', target: 3, current: 1, icon: 'car' }]));

    await expect(saveWeeklyGoal(initialGoalActionState, form)).resolves.toMatchObject({ status: 'saved' });
    expect(mocks.upsertTeamGoal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WEEKLY' }),
      expect.objectContaining({ approaches: 20 }),
      undefined,
      [{ id: 'car-goal', name: 'Carros', unit: 'veículos', target: 3, current: 1, icon: 'car' }]
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
