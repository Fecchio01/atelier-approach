import { describe, expect, test } from 'vitest';

import { getGoalPeriodWindow, getLocalDayWindow, isSameLocalDay } from '../../lib/goal-periods';

describe('goal period windows', () => {
  test('resolves dashboard day boundaries in São Paulo rather than the server timezone', () => {
    expect(getLocalDayWindow(new Date('2026-09-27T02:30:00.000Z'))).toEqual({
      start: new Date('2026-09-26T03:00:00.000Z'),
      end: new Date('2026-09-27T03:00:00.000Z')
    });
  });

  test('compares dashboard dates by São Paulo calendar day across UTC midnight', () => {
    expect(isSameLocalDay(new Date('2026-09-27T02:30:00.000Z'), new Date('2026-09-26T22:00:00.000Z'))).toBe(true);
  });

  test('starts a week on Monday at midnight in São Paulo, even when UTC is already Sunday', () => {
    expect(getGoalPeriodWindow('WEEKLY', new Date('2026-09-27T02:30:00.000Z'), 14)).toEqual({
      kind: 'WEEKLY',
      start: new Date('2026-09-21T03:00:00.000Z'),
      end: new Date('2026-09-28T03:00:00.000Z')
    });
  });

  test('starts an anchored monthly cycle on the configured local date', () => {
    expect(getGoalPeriodWindow('MONTHLY', new Date('2026-06-14T02:59:59.999Z'), 14)).toEqual({
      kind: 'MONTHLY',
      start: new Date('2026-05-14T03:00:00.000Z'),
      end: new Date('2026-06-14T03:00:00.000Z')
    });
  });

  test('clamps day 31 to February without shifting the following cycle', () => {
    expect(getGoalPeriodWindow('MONTHLY', new Date('2025-02-10T12:00:00.000Z'), 31)).toEqual({
      kind: 'MONTHLY',
      start: new Date('2025-01-31T03:00:00.000Z'),
      end: new Date('2025-02-28T03:00:00.000Z')
    });
    expect(getGoalPeriodWindow('MONTHLY', new Date('2025-03-01T12:00:00.000Z'), 31)).toEqual({
      kind: 'MONTHLY',
      start: new Date('2025-02-28T03:00:00.000Z'),
      end: new Date('2025-03-31T03:00:00.000Z')
    });
  });

  test('clamps day 31 to leap-day and resumes on March 31', () => {
    expect(getGoalPeriodWindow('MONTHLY', new Date('2024-02-29T15:00:00.000Z'), 31)).toEqual({
      kind: 'MONTHLY',
      start: new Date('2024-02-29T03:00:00.000Z'),
      end: new Date('2024-03-31T03:00:00.000Z')
    });
  });

  test('keeps the active cycle start and ends it at the next future occurrence after an anchor change', () => {
    expect(getGoalPeriodWindow(
      'MONTHLY',
      new Date('2026-09-20T12:00:00.000Z'),
      5,
      new Date('2026-09-14T03:00:00.000Z')
    )).toEqual({
      kind: 'MONTHLY',
      start: new Date('2026-09-14T03:00:00.000Z'),
      end: new Date('2026-10-05T03:00:00.000Z')
    });
  });

  test('does not use today or an already-passed new anchor to close the transition cycle', () => {
    expect(getGoalPeriodWindow(
      'MONTHLY',
      new Date('2026-09-20T12:00:00.000Z'),
      14,
      new Date('2026-09-01T03:00:00.000Z')
    )).toEqual({
      kind: 'MONTHLY',
      start: new Date('2026-09-01T03:00:00.000Z'),
      end: new Date('2026-10-14T03:00:00.000Z')
    });
  });
});
