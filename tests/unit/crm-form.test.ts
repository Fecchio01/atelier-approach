import { describe, expect, test } from 'vitest';

import { parseClosingValues } from '../../lib/crm-form';

describe('parseClosingValues', () => {
  test('rejects blank values instead of converting them to zero', () => {
    expect(parseClosingValues('', '')).toBeNull();
    expect(parseClosingValues('100', '')).toBeNull();
  });

  test('accepts explicit numeric zero values', () => {
    expect(parseClosingValues('0', '0')).toEqual({ saleValue: 0, mrr: 0 });
  });
});
