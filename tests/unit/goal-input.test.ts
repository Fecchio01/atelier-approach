import { describe, expect, test } from 'vitest';

import { parseGoalTargets } from '../../lib/goal-input';

describe('goal target input', () => {
  test('turns blank optional fields into null and parses all positive targets', () => {
    expect(parseGoalTargets({
      approaches: '20', interests: '8', meetings: '4', sales: '3',
      revenue: '12500.50', mrr: '899.90', followUpsCompleted: '12', conversionRate: '35'
    })).toEqual({
      ok: true,
      targets: {
        approaches: 20, interests: 8, meetings: 4, sales: 3,
        revenue: 12500.5, mrr: 899.9, followUpsCompleted: 12, conversionRate: 35
      }
    });
    const noTargets = parseGoalTargets({ approaches: '', interests: '  ' });
    expect(noTargets.ok).toBe(true);
    if (!noTargets.ok) return;
    expect(noTargets.targets).toEqual({
      approaches: null, interests: null, meetings: null, sales: null,
      revenue: null, mrr: null, followUpsCompleted: null, conversionRate: null
    });
  });

  test.each([
    ['zero count target', { approaches: '0' }],
    ['fractional count target', { meetings: '1.5' }],
    ['negative money target', { revenue: '-1' }],
    ['invalid money target', { mrr: 'NaN' }],
    ['conversion below one percent', { conversionRate: '0.5' }],
    ['conversion above one hundred percent', { conversionRate: '100.1' }]
  ])('rejects a %s instead of silently storing it', (_label, values) => {
    expect(parseGoalTargets(values)).toMatchObject({ ok: false });
  });
});
