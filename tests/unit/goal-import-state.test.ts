import { describe, expect, test } from 'vitest';

import { applyGoalSuggestions, createGoalSaveFormData, type ReviewedGoalSuggestion } from '../../lib/goal-import-state';

describe('reviewed goal suggestions', () => {
  test('saves the reviewer-selected thematic group with a custom PDF metric', () => {
    const result = applyGoalSuggestions({}, [], [
      { id: 'pdf-pain', name: 'Dores confirmadas', target: '3', current: '1', destination: 'custom', icon: 'checklist', group: 'progress' }
    ]);

    expect(result.customGoals[0]).toMatchObject({ name: 'Dores confirmadas', group: 'progress' });
  });

  test('PDF custom names never infer an automatic source and existing sources survive', () => {
    const result = applyGoalSuggestions({}, [{ id: 'existing', name: 'Vendas', target: 5, current: 2, source: 'sales' }], [
      { id: 'pdf', name: 'Abordagens', target: '20', current: '3', destination: 'custom', icon: 'target' }
    ]);
    expect(result.customGoals[0]).toMatchObject({ source: 'sales', current: 2 });
    expect(result.customGoals[1]).toMatchObject({ source: 'manual', current: 3 });
  });
  test('merges reviewed fixed targets and appends custom metrics without losing existing values', () => {
    const result = applyGoalSuggestions(
      { approaches: '12', sales: '4' },
      [{ id: 'existing', name: 'Carros', target: 3, current: 1, icon: 'car' }],
      [
        { id: 'fixed', name: 'Abordagens', target: '500', current: '0', destination: 'approaches', icon: 'target' },
        { id: 'custom', name: 'Veículos entregues', unit: 'carros', target: '8', current: '2', destination: 'custom', icon: 'car' }
      ]
    );

    expect(result.targets).toMatchObject({ approaches: '500', sales: '4' });
    expect(result.customGoals).toEqual([
      { id: 'existing', name: 'Carros', target: 3, current: 1, icon: 'car' },
      { id: 'custom', name: 'Veículos entregues', unit: 'carros', target: 8, current: 2, icon: 'car', source: 'manual' }
    ]);
  });

  test('keeps malformed rows out of the form draft rather than coercing them to zero', () => {
    const suggestions: ReviewedGoalSuggestion[] = [
      { id: 'invalid-target', name: 'Carros', target: 'não definido', current: '0', destination: 'custom', icon: 'car' },
      { id: 'invalid-key', name: 'Outro', target: '3', current: '-1', destination: 'approaches', icon: 'target' }
    ];

    expect(applyGoalSuggestions({}, [], suggestions)).toEqual({ targets: {}, customGoals: [] });
  });

  test('preserves zero-target custom goals but does not set fixed CRM targets to zero', () => {
    const result = applyGoalSuggestions({}, [], [
      { id: 'zero-limit', name: 'Repetições / fora do perfil', target: '0', current: '0', destination: 'custom', icon: 'target' },
      { id: 'zero-fixed', name: 'Abordagens', target: '0', current: '0', destination: 'approaches', icon: 'target' }
    ]);

    expect(result).toEqual({
      targets: {},
      customGoals: [{ id: 'zero-limit', name: 'Repetições / fora do perfil', target: 0, current: 0, icon: 'target', source: 'manual' }]
    });
  });

  test('builds the server-save payload from the applied PDF goals and selected monthly cycle', () => {
    const customGoals = [
      { id: 'pdf-pain', name: 'Dores confirmadas', target: 3, current: 1, icon: 'checklist' as const, group: 'progress' as const, source: 'manual' as const }
    ];
    const formData = createGoalSaveFormData({ approaches: '25', interests: '', sales: '2' }, customGoals, '14');

    expect(formData.get('approaches')).toBe('25');
    expect(formData.get('interests')).toBe('');
    expect(formData.get('sales')).toBe('2');
    expect(JSON.parse(String(formData.get('customGoals')))).toEqual(customGoals);
    expect(formData.get('monthlyStartDay')).toBe('14');
  });

  test('updates the same imported custom goal when retrying after a failed auto-save', () => {
    const firstApply = applyGoalSuggestions({}, [], [
      { id: 'pdf-car', name: 'Carros', unit: 'carros', target: '3', current: '1', destination: 'custom', icon: 'car', group: 'vehicles' }
    ]);
    const retry = applyGoalSuggestions({}, firstApply.customGoals, [
      { id: 'pdf-car', name: 'Carros entregues', unit: 'carros', target: '5', current: '2', destination: 'custom', icon: 'car', group: 'vehicles' }
    ]);

    expect(retry.customGoals).toEqual([
      { id: 'pdf-car', name: 'Carros entregues', unit: 'carros', target: 5, current: 2, icon: 'car', group: 'vehicles', source: 'manual' }
    ]);
  });
});
