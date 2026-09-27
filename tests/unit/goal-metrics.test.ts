import { describe, expect, test } from 'vitest';

import { getTeamGoalProgress, type GoalMetricActuals, type TeamGoalTargets } from '../../lib/metrics';

describe('team goal progress', () => {
  test('compares all eight actuals to their configured targets', () => {
    const actuals: GoalMetricActuals = {
      approaches: 3,
      interests: 2,
      meetings: 1,
      sales: 1,
      revenue: 750,
      mrr: 99,
      followUpsCompleted: 4,
      conversionRate: 25
    };
    const targets: TeamGoalTargets = {
      approaches: 10,
      interests: 4,
      meetings: 2,
      sales: 2,
      revenue: 1000,
      mrr: 200,
      followUpsCompleted: 5,
      conversionRate: 50
    };

    expect(getTeamGoalProgress(actuals, targets)).toEqual({
      approaches: { actual: 3, target: 10, ratio: 0.3 },
      interests: { actual: 2, target: 4, ratio: 0.5 },
      meetings: { actual: 1, target: 2, ratio: 0.5 },
      sales: { actual: 1, target: 2, ratio: 0.5 },
      revenue: { actual: 750, target: 1000, ratio: 0.75 },
      mrr: { actual: 99, target: 200, ratio: 0.5 },
      followUpsCompleted: { actual: 4, target: 5, ratio: 0.8 },
      conversionRate: { actual: 25, target: 50, ratio: 0.5 }
    });
  });

  test('shows realized values without an artificial progress ratio when no target is set', () => {
    const actuals: GoalMetricActuals = {
      approaches: 0, interests: 0, meetings: 0, sales: 0,
      revenue: 0, mrr: 0, followUpsCompleted: 0, conversionRate: 0
    };
    const targets: TeamGoalTargets = {
      approaches: null, interests: null, meetings: null, sales: null,
      revenue: null, mrr: null, followUpsCompleted: null, conversionRate: null
    };

    expect(getTeamGoalProgress(actuals, targets).approaches).toEqual({ actual: 0, target: null, ratio: null });
    expect(getTeamGoalProgress(actuals, targets).conversionRate).toEqual({ actual: 0, target: null, ratio: null });
  });

  test('keeps zero production at zero progress and guards invalid zero targets', () => {
    const actuals: GoalMetricActuals = {
      approaches: 0, interests: 0, meetings: 0, sales: 0,
      revenue: 0, mrr: 0, followUpsCompleted: 0, conversionRate: 0
    };
    const targets = {
      approaches: 10, interests: 10, meetings: 10, sales: 10,
      revenue: 100, mrr: 100, followUpsCompleted: 10, conversionRate: 0
    } as unknown as TeamGoalTargets;

    expect(getTeamGoalProgress(actuals, targets).approaches.ratio).toBe(0);
    expect(getTeamGoalProgress(actuals, targets).conversionRate).toEqual({ actual: 0, target: null, ratio: null });
  });

  test('shows no conversion ratio when there were no approaches in the period', () => {
    const actuals: GoalMetricActuals = {
      approaches: 0, interests: 0, meetings: 0, sales: 0,
      revenue: 0, mrr: 0, followUpsCompleted: 0, conversionRate: 0
    };
    const targets: TeamGoalTargets = {
      approaches: null, interests: null, meetings: null, sales: null,
      revenue: null, mrr: null, followUpsCompleted: null, conversionRate: 25
    };

    expect(getTeamGoalProgress(actuals, targets).conversionRate).toEqual({ actual: 0, target: 25, ratio: null });
  });
});
