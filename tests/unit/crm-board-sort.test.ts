import { describe, expect, it } from 'vitest';

import * as crmBoardSort from '../../lib/crm-board-view';

const leads = [
  { id: 'unscheduled-new', name: 'Beta', nextActionAt: null, stageEnteredAt: '2026-10-15T10:00:00.000Z', saleValue: null },
  { id: 'due-soon', name: 'Café', nextActionAt: '2026-10-25T10:00:00.000Z', stageEnteredAt: '2026-10-20T10:00:00.000Z', saleValue: '250.00' },
  { id: 'overdue', name: 'Alfa', nextActionAt: '2026-10-20T10:00:00.000Z', stageEnteredAt: '2026-10-21T10:00:00.000Z', saleValue: '1200.00' },
  { id: 'unscheduled-old', name: 'Delta', nextActionAt: null, stageEnteredAt: '2026-09-01T10:00:00.000Z', saleValue: '0.00' }
];

describe('CRM board sorting', () => {
  it('prioritizes the soonest dated action, then the longest-waiting unscheduled lead', () => {
    const sortLeads = (crmBoardSort as unknown as {
      sortCrmBoardLeads?: (items: typeof leads, order: string) => typeof leads;
    }).sortCrmBoardLeads;

    expect(sortLeads).toBeTypeOf('function');
    if (!sortLeads) return;

    expect(sortLeads(leads, 'next-action').map(({ id }) => id)).toEqual([
      'overdue', 'due-soon', 'unscheduled-old', 'unscheduled-new'
    ]);
  });

  it('orders by stage age, sale value, name, or the existing order without mutating input', () => {
    const sortLeads = (crmBoardSort as unknown as {
      sortCrmBoardLeads?: (items: typeof leads, order: string) => typeof leads;
    }).sortCrmBoardLeads;

    expect(sortLeads).toBeTypeOf('function');
    if (!sortLeads) return;

    expect(sortLeads(leads, 'oldest-stage').map(({ id }) => id)).toEqual([
      'unscheduled-old', 'unscheduled-new', 'due-soon', 'overdue'
    ]);
    expect(sortLeads(leads, 'sale-value').map(({ id }) => id)).toEqual([
      'overdue', 'due-soon', 'unscheduled-old', 'unscheduled-new'
    ]);
    expect(sortLeads(leads, 'name').map(({ id }) => id)).toEqual([
      'overdue', 'unscheduled-new', 'due-soon', 'unscheduled-old'
    ]);
    expect(sortLeads(leads, 'current').map(({ id }) => id)).toEqual([
      'unscheduled-new', 'due-soon', 'overdue', 'unscheduled-old'
    ]);
    expect(leads.map(({ id }) => id)).toEqual([
      'unscheduled-new', 'due-soon', 'overdue', 'unscheduled-old'
    ]);
  });
});
