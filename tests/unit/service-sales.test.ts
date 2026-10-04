import { describe, expect, test } from 'vitest';
import { summarizeServiceItems } from '../../lib/service-sales';

describe('service sale totals', () => {
  test('empty selection closes an unpriced sale', () => {
    expect(summarizeServiceItems([])).toEqual({ saleValue: 0, mrr: 0 });
  });
  test('counts monthly prices in sale and MRR, one-time prices only in sale', () => {
    expect(summarizeServiceItems([
      { price: '1200.25', billingType: 'ONE_TIME' },
      { price: '99.90', billingType: 'MONTHLY' },
      { price: 0.1, billingType: 'MONTHLY' },
      { price: 0.2, billingType: 'MONTHLY' }
    ])).toEqual({ saleValue: 1300.45, mrr: 100.2 });
  });
  test.each(['-1', '', 'Infinity', '1.001', '1e3', 'abc'])('rejects invalid monetary input %s', (price) => {
    expect(() => summarizeServiceItems([{ price, billingType: 'MONTHLY' }])).toThrow();
  });
});
