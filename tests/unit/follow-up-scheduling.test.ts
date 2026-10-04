import { describe, expect, test } from 'vitest';

import { getFollowUpDueDate } from '../../lib/follow-up-scheduling';

describe('getFollowUpDueDate', () => {
  test.each([2, 3])('adds %i days while preserving the time', (delayDays) => {
    const now = new Date('2026-09-10T10:15:30.000Z');

    expect(getFollowUpDueDate(now, delayDays)).toEqual(
      new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000)
    );
  });

  test('crosses month and year boundaries using calendar-valid UTC dates', () => {
    expect(getFollowUpDueDate(new Date('2026-12-31T23:45:00.000Z'), 2)).toEqual(
      new Date('2027-01-02T23:45:00.000Z')
    );
  });

  test.each([
    [new Date(Number.NaN), 2],
    [new Date('2026-09-10T10:00:00.000Z'), 0],
    [new Date('2026-09-10T10:00:00.000Z'), -1],
    [new Date('2026-09-10T10:00:00.000Z'), 1.5],
    [new Date('2026-09-10T10:00:00.000Z'), Number.NaN]
  ] as const)('rejects invalid input %j', (now, delayDays) => {
    expect(() => getFollowUpDueDate(now, delayDays)).toThrow(RangeError);
  });
});
