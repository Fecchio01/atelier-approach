import { describe, expect, it } from 'vitest';

import { getSelectedServiceSummary } from '../../lib/commercial-ui';

describe('getSelectedServiceSummary', () => {
  it('combines one-time and monthly catalog items without double-counting MRR', () => {
    const summary = getSelectedServiceSummary([
      { id: 'monthly', name: 'Plano mensal', price: '199.90', billingType: 'MONTHLY' },
      { id: 'setup', name: 'Implantação', price: '500.00', billingType: 'ONE_TIME' },
      { id: 'support', name: 'Suporte mensal', price: '0.10', billingType: 'MONTHLY' }
    ], ['monthly', 'setup', 'support']);

    expect(summary).toEqual({ saleValue: 700, mrr: 200 });
  });

  it('ignores services not included in the current selection', () => {
    const summary = getSelectedServiceSummary([
      { id: 'monthly', name: 'Plano mensal', price: '299.90', billingType: 'MONTHLY' },
      { id: 'setup', name: 'Implantação', price: '500.00', billingType: 'ONE_TIME' }
    ], ['setup']);

    expect(summary).toEqual({ saleValue: 500, mrr: 0 });
  });

  it('returns zero totals for an empty selection so the user can close without a catalog item', () => {
    expect(getSelectedServiceSummary([], [])).toEqual({ saleValue: 0, mrr: 0 });
  });
});
