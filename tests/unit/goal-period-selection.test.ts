import { describe, expect, test } from 'vitest';

import { readGoalPeriodSelection, writeGoalPeriodSelection } from '../../lib/goal-period-selection';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

describe('goal period selection persistence', () => {
  test('restores the monthly tab after navigating away or signing out and back in', () => {
    const storage = createStorage();

    writeGoalPeriodSelection(storage, 'MONTHLY');

    // A fresh page instance reads the browser preference left by the prior session.
    expect(readGoalPeriodSelection(storage)).toBe('MONTHLY');
  });

  test('falls back to weekly for absent or invalid stored preferences', () => {
    expect(readGoalPeriodSelection(createStorage())).toBe('WEEKLY');
    expect(readGoalPeriodSelection(createStorage({ 'arvello.goal-period-selection': 'YEARLY' }))).toBe('WEEKLY');
  });
});
