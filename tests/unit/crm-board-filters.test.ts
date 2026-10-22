import { describe, expect, it } from 'vitest';

import * as crmBoardFilters from '../../lib/crm-board-view';

const leads = [
  { id: 'due', nextActionAt: '2026-10-25T10:00:00.000Z', phone: null, whatsapp: null },
  { id: 'phone', nextActionAt: null, phone: '+55 11 99999-0000', whatsapp: null },
  { id: 'whatsapp', nextActionAt: null, phone: null, whatsapp: 'https://wa.me/5511999990000' },
  { id: 'no-contact', nextActionAt: null, phone: null, whatsapp: null }
];

describe('CRM board quick filters', () => {
  it('isolates leads with or without a scheduled next action', () => {
    const filterLeads = (crmBoardFilters as unknown as {
      filterCrmBoardLeads?: (items: typeof leads, filter: string) => typeof leads;
    }).filterCrmBoardLeads;

    expect(filterLeads).toBeTypeOf('function');
    if (!filterLeads) return;

    expect(filterLeads(leads, 'with-next-action').map(({ id }) => id)).toEqual(['due']);
    expect(filterLeads(leads, 'without-next-action').map(({ id }) => id)).toEqual([
      'phone', 'whatsapp', 'no-contact'
    ]);
  });

  it('finds either published phone or WhatsApp and keeps all leads in the default view', () => {
    const filterLeads = (crmBoardFilters as unknown as {
      filterCrmBoardLeads?: (items: typeof leads, filter: string) => typeof leads;
    }).filterCrmBoardLeads;

    expect(filterLeads).toBeTypeOf('function');
    if (!filterLeads) return;

    expect(filterLeads(leads, 'has-contact').map(({ id }) => id)).toEqual(['phone', 'whatsapp']);
    expect(filterLeads(leads, 'all')).toEqual(leads);
  });
});
