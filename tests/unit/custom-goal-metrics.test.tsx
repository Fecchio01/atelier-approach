import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.stubGlobal('React', React);

import { CustomGoalMetricRow } from '../../app/(app)/metas/custom-goal-metrics';
import type { GoalMetricActuals } from '../../lib/metrics';

describe('custom goal imported progress', () => {
  test('shows imported results on the exact custom indicator without editing the target', () => {
    const html = renderToStaticMarkup(<CustomGoalMetricRow
      goal={{ id: 'approved-cars', name: 'Carros aprovados', unit: 'carros', target: 20, current: 1, icon: 'car', group: 'vehicles', source: 'manual' }}
      index={0}
      actuals={{ approaches: 0, interests: 0, meetings: 0, sales: 0, revenue: 0, mrr: 0, followUpsCompleted: 0, conversionRate: 0 } satisfies GoalMetricActuals}
      importedCurrent={3}
      isEditing={false}
      onToggle={() => undefined}
      onChange={() => undefined}
      onCommit={() => undefined}
      onRemove={() => undefined}
    />);

    expect(html).toContain('Carros aprovados: 4 carros de 20 carros');
    expect(html).toContain('inclui resultado do PDF');
    expect(html).toContain('Meta</span><span class="block truncate text-sm font-semibold leading-5 text-white/85">20 carros');
  });
});
