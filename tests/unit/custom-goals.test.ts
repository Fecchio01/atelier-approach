import { describe, expect, test } from 'vitest';

import { getCustomGoalCurrent, parseCustomGoalMetrics, type CustomGoalMetric } from '../../lib/custom-goals';

describe('custom team goals', () => {
  const actuals = { approaches: 20, interests: 4, meetings: 3, sales: 2, revenue: 500, mrr: 100, followUpsCompleted: 6, conversionRate: 10 };

  test('legacy and explicit manual sources use stored progress', () => {
    const goal: CustomGoalMetric = { id: 'legacy', name: 'Carros', target: 5, current: 2 };
    expect(getCustomGoalCurrent(goal, actuals)).toBe(2);
    expect(getCustomGoalCurrent({ ...goal, source: 'manual' }, actuals)).toBe(2);
    expect(parseCustomGoalMetrics([{ ...goal, source: 'manual' }])).toEqual({ ok: true, goals: [{ ...goal, source: 'manual' }] });
  });

  test('uses the supplied period results rather than storing a calculated value', () => {
    const goal: CustomGoalMetric = { id: 'period', name: 'Reuniões', target: 10, current: 1, source: 'meetings' };
    expect(getCustomGoalCurrent(goal, { ...actuals, meetings: 2 })).toBe(2);
    expect(getCustomGoalCurrent(goal, { ...actuals, meetings: 8 })).toBe(8);
    expect(goal.current).toBe(1);
  });

  test.each(Object.keys(actuals))('accepts and reads the explicit CRM source %s', (source) => {
    const parsed = parseCustomGoalMetrics([{ id: 'crm', name: 'Meta', target: 50, current: 7, source }]);
    expect(parsed).toMatchObject({ ok: true, goals: [{ source, current: 7 }] });
    if (parsed.ok) expect(getCustomGoalCurrent(parsed.goals[0], actuals)).toBe(actuals[source as keyof typeof actuals]);
  });

  test('switching to automatic and back preserves stored manual progress', () => {
    const goal: CustomGoalMetric = { id: 'switch', name: 'Conversas', target: 40, current: 7, source: 'approaches' };
    expect(getCustomGoalCurrent(goal, actuals)).toBe(20);
    expect(getCustomGoalCurrent({ ...goal, source: 'manual' }, actuals)).toBe(7);
    expect(goal.current).toBe(7);
  });

  test.each(['unknown', 'NEW', null, 1])('rejects unsupported progress source %j', (source) => {
    expect(parseCustomGoalMetrics([{ id: 'bad', name: 'Meta', target: 5, current: 1, source }])).toMatchObject({ ok: false });
  });
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
