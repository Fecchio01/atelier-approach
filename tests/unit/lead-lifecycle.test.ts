import { describe, expect, test } from 'vitest';
import {
  getFollowUpDueAt,
  getLeadLifecycleWarning,
  getPostFollowUpDiscardAt,
  isPurgeEligible,
  type LifecycleProcessingResult
} from '../../lib/lead-lifecycle';

const processingResult: LifecycleProcessingResult = {
  movedToFollowUp: 1,
  discardedForInactivity: 2,
  permanentlyDeleted: 3
};
void processingResult;

describe('lead lifecycle date rules', () => {
  test('schedules the follow-up by exact elapsed integer days', () => {
    expect(getFollowUpDueAt(new Date('2026-03-07T10:15:30.250Z'), 2))
      .toEqual(new Date('2026-03-09T10:15:30.250Z'));
  });

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid or non-positive follow-up delay %s',
    (delayDays) => {
      expect(() => getFollowUpDueAt(new Date('2026-03-07T10:15:30.250Z'), delayDays))
        .toThrow(RangeError);
    }
  );

  test('starts a five-day discard timer at completion, independent of the previous due time', () => {
    const previousDueAt = new Date('2026-03-09T10:15:30.250Z');
    const completedAt = new Date('2026-03-12T18:45:00.000Z');

    expect(getPostFollowUpDiscardAt(completedAt))
      .toEqual(new Date('2026-03-17T18:45:00.000Z'));
    expect(getPostFollowUpDiscardAt(completedAt)).not.toEqual(previousDueAt);
  });

  test('purges only at or after the seven-day boundary and preserves null legacy dates', () => {
    const discardedAt = new Date('2026-03-01T10:00:00.000Z');
    const deadline = new Date('2026-03-08T10:00:00.000Z');

    expect(isPurgeEligible(null, deadline)).toBe(false);
    expect(isPurgeEligible(discardedAt, new Date('2026-03-08T09:59:59.999Z'))).toBe(false);
    expect(isPurgeEligible(discardedAt, deadline)).toBe(true);
    expect(isPurgeEligible(discardedAt, new Date('2026-03-08T10:00:00.001Z'))).toBe(true);
  });

  test('warns in the final 24 hours and keeps overdue unprocessed records visible', () => {
    const completedAt = new Date('2026-03-01T12:00:00.000Z');
    const deadline = new Date('2026-03-06T12:00:00.000Z');

    expect(getLeadLifecycleWarning('lead-1', completedAt, new Date('2026-03-05T11:59:59.999Z'))).toBeNull();
    expect(getLeadLifecycleWarning('lead-1', completedAt, new Date('2026-03-05T12:00:00.000Z')))
      .toEqual({ leadId: 'lead-1', discardAt: deadline, daysRemaining: 1 });
    expect(getLeadLifecycleWarning('lead-1', completedAt, deadline))
      .toEqual({ leadId: 'lead-1', discardAt: deadline, daysRemaining: 0 });
    expect(getLeadLifecycleWarning('lead-1', completedAt, new Date('2026-03-08T12:00:00.000Z')))
      .toEqual({ leadId: 'lead-1', discardAt: deadline, daysRemaining: -2 });
  });
});
