import { describe, expect, it } from 'vitest';

import { getBusinessNicheLabel } from '../../lib/business-category';

describe('business niche labels', () => {
  it.each([
    ['automotive_repair', 'Oficina mecânica'],
    ['barber_shop', 'Barbearia'],
    ['beauty_salon', 'Salão de beleza'],
    ['fitness_center', 'Academia']
  ])('translates %s to %s', (category, label) => {
    expect(getBusinessNicheLabel(category)).toBe(label);
  });

  it('returns a readable fallback for an unknown category code', () => {
    expect(getBusinessNicheLabel('niche_a_b')).toBe('Niche A B');
  });
});
