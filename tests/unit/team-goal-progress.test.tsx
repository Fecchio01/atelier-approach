import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.stubGlobal('React', React);

import { TeamGoalProgress } from '../../components/team-goal-progress';
import type { GoalProgressByMetric } from '../../lib/metrics';

function progress(target: number | null, reportedConversion = false): GoalProgressByMetric {
  return {
    approaches: { actual: 5, target, ratio: target ? 0.5 : null },
    interests: { actual: 1, target: null, ratio: null },
    meetings: { actual: 0, target: null, ratio: null },
    sales: { actual: 0, target: null, ratio: null },
    revenue: { actual: 0, target: null, ratio: null },
    mrr: { actual: 0, target: null, ratio: null },
    followUpsCompleted: { actual: 0, target: null, ratio: null },
    conversionRate: reportedConversion
      ? { actual: 27.5, target: 50, ratio: 0.55, reported: true }
      : { actual: 0, target: null, ratio: null }
  };
}

describe('expanded team goal progress', () => {
  test('shows a neutral track and “Sem meta” without progressbar semantics when target is absent', () => {
    const html = renderToStaticMarkup(<TeamGoalProgress progress={progress(null)} hasApproaches />);
    expect(html).toContain('Sem meta');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('aria-valuenow');
  });

  test('preserves percentage and accessible progressbar semantics when a target exists', () => {
    const html = renderToStaticMarkup(<TeamGoalProgress progress={progress(10)} hasApproaches />);
    expect(html).toContain('50%');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
  });

  test('shows a PDF-reported conversion rate and target progress without approaches', () => {
    const html = renderToStaticMarkup(<TeamGoalProgress progress={progress(null, true)} hasApproaches={false} />);
    expect(html).toContain('27,5%');
    expect(html).toContain('55%');
    expect(html).toContain('role="progressbar"');
  });
});
