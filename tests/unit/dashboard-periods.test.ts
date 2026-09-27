import { describe, expect, test } from 'vitest';

import { getGoalPeriodWindow, selectDashboardWindow, selectGoalPeriod } from '../../lib/goal-periods';

describe('dashboard period selection', () => {
  test('uses the saved monthly transition bounds instead of recalculating the configured anchor', () => {
    const now = new Date('2026-09-20T15:00:00.000Z');
    const weekly = getGoalPeriodWindow('WEEKLY', now, 14);
    const savedTransition = {
      kind: 'MONTHLY' as const,
      start: new Date('2026-09-14T03:00:00.000Z'),
      end: new Date('2026-10-05T03:00:00.000Z')
    };

    expect(selectDashboardWindow('month', now, weekly, savedTransition)).toEqual({
      start: savedTransition.start,
      end: savedTransition.end
    });
  });

  test('keeps an explicitly requested old report cycle instead of falling back to the current one', () => {
    const activeGoal = { periodStart: new Date('2026-09-14T03:00:00.000Z'), id: 'active' };
    const oldGoal = { periodStart: new Date('2022-01-14T03:00:00.000Z'), id: 'old' };

    expect(selectGoalPeriod(oldGoal.periodStart, oldGoal, activeGoal)).toBe(oldGoal);
    expect(selectGoalPeriod(new Date('2021-01-01T00:00:00.000Z'), null, activeGoal)).toBeNull();
    expect(selectGoalPeriod(null, null, activeGoal)).toBe(activeGoal);
  });
});
