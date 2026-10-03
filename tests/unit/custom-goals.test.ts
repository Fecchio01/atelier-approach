import { describe, expect, test } from 'vitest';

import { parseCustomGoalMetrics } from '../../lib/custom-goals';

describe('custom team goals', () => {
  test('normalizes valid serialized goals and keeps manually entered progress', () => {
    expect(parseCustomGoalMetrics('[{"id":"metric-1","name":"Carros","unit":"unidades","target":3,"current":1,"icon":"car"}]')).toEqual({
      ok: true,
      goals: [{ id: 'metric-1', name: 'Carros', unit: 'unidades', target: 3, current: 1, icon: 'car' }]
    });
  });

  test('trims labels and drops an empty optional unit', () => {
    expect(parseCustomGoalMetrics([{ id: 'metric-1', name: '  Parcerias  ', unit: '  ', target: 2, current: 0, icon: 'target' }])).toEqual({
      ok: true,
      goals: [{ id: 'metric-1', name: 'Parcerias', target: 2, current: 0, icon: 'target' }]
    });
  });

  test('accepts a zero target for a goal that must remain at zero', () => {
    expect(parseCustomGoalMetrics([{ id: 'zero-limit', name: 'Repetições', target: 0, current: 0, icon: 'target' }])).toEqual({
      ok: true,
      goals: [{ id: 'zero-limit', name: 'Repetições', target: 0, current: 0, icon: 'target' }]
    });
  });

  test('rejects repeated identifiers so an edited card cannot overwrite another', () => {
    expect(parseCustomGoalMetrics([
      { id: 'same', name: 'Meta A', target: 1, current: 0, icon: 'target' },
      { id: 'same', name: 'Meta B', target: 2, current: 0, icon: 'target' }
    ])).toMatchObject({ ok: false });
  });

  test.each([
    [{ id: 'a', name: 'Meta', target: -1, current: 0, icon: 'target' }],
    [{ id: 'a', name: 'Meta', target: 1, current: -1, icon: 'target' }],
    [{ id: 'a', name: 'Meta', target: Number.POSITIVE_INFINITY, current: 0, icon: 'target' }]
  ])('rejects non-positive, negative or non-finite values: %j', (goal) => {
    expect(parseCustomGoalMetrics([goal])).toMatchObject({ ok: false });
  });

  test('rejects icon keys that are not part of the approved set', () => {
    expect(parseCustomGoalMetrics([{ id: 'a', name: 'Meta', target: 1, current: 0, icon: 'arbitrary-component' }])).toMatchObject({ ok: false });
  });

  test('rejects more than thirty goals in a cycle', () => {
    const goals = Array.from({ length: 31 }, (_, index) => ({ id: `metric-${index}`, name: `Meta ${index}`, target: 1, current: 0, icon: 'target' }));
    expect(parseCustomGoalMetrics(goals)).toMatchObject({ ok: false });
  });
});
