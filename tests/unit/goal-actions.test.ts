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
});
