import { describe, expect, test } from 'vitest';

import { filterAndSortCrmQueue, parseCrmTaskCreateInput, type CrmQueueItem } from '../../lib/crm-task-queue';

describe('parseCrmTaskCreateInput', () => {
  test('accepts a complete task input without trusting actor identity', () => {
    const parsed = parseCrmTaskCreateInput({
      leadId: 'lead-1', title: 'Enviar proposta', type: 'EMAIL', priority: 'HIGH',
      dueDate: '2026-10-24T15:30:00.000Z', assigneeId: 'member-2', createdById: 'spoofed'
    });

    expect(parsed).toEqual({ ok: true, value: {
      leadId: 'lead-1', title: 'Enviar proposta', type: 'EMAIL', priority: 'HIGH',
      dueDate: new Date('2026-10-24T15:30:00.000Z'), assigneeId: 'member-2'
    } });
  });

  test.each([
    [{ ...{ leadId: 'lead', title: '  ', type: 'EMAIL', priority: 'HIGH', dueDate: '2026-10-24T15:30:00Z', assigneeId: 'member' } }, 'title'],
    [{ leadId: 'lead', title: 'Enviar', type: 'SMS', priority: 'HIGH', dueDate: '2026-10-24T15:30:00Z', assigneeId: 'member' }, 'type'],
    [{ leadId: 'lead', title: 'Enviar', type: 'EMAIL', priority: 'URGENT', dueDate: '2026-10-24T15:30:00Z', assigneeId: 'member' }, 'priority'],
    [{ leadId: 'lead', title: 'Enviar', type: 'EMAIL', priority: 'HIGH', dueDate: '2026-02-30T15:30:00Z', assigneeId: 'member' }, 'dueDate'],
    [{ leadId: 'lead', title: 'Enviar', type: 'EMAIL', priority: 'HIGH', dueDate: 'amanhã', assigneeId: 'member' }, 'dueDate']
  ])('rejects invalid task data (%s)', (input, field) => {
    expect(parseCrmTaskCreateInput(input)).toEqual({ ok: false, field });
  });
});

describe('filterAndSortCrmQueue', () => {
  const now = new Date('2026-10-22T02:30:00.000Z'); // 23:30 in America/Sao_Paulo on Oct 21.
  const item = (id: string, dueDate: string, priority: CrmQueueItem['priority'] = 'NORMAL', assigneeId = 'ana'): CrmQueueItem => ({
    kind: 'TASK', id, leadId: `lead-${id}`, leadName: `Empresa ${id}`, title: id,
    dueDate: new Date(dueDate), priority, assigneeId, assigneeName: assigneeId, state: 'PENDING'
  });

  test('uses the São Paulo calendar day for today and future boundaries', () => {
    const items = [
      item('today-later', '2026-10-22T02:45:00.000Z'),
      item('today-past', '2026-10-22T01:00:00.000Z'),
      item('yesterday', '2026-10-21T12:00:00.000Z'),
      item('tomorrow-late', '2026-10-23T02:30:00.000Z')
    ];

    expect(filterAndSortCrmQueue(items, { period: 'TODAY' }, now).map(({ id }) => id)).toEqual(['today-past', 'today-later']);
    expect(filterAndSortCrmQueue(items, { period: 'OVERDUE' }, now).map(({ id }) => id)).toEqual(['yesterday']);
    expect(filterAndSortCrmQueue(items, { period: 'FUTURE' }, now).map(({ id }) => id)).toEqual(['tomorrow-late']);
  });

  test('combines assignee and period filters and orders overdue, due time, then priority', () => {
    const items = [
      item('future-low', '2026-10-24T12:00:00.000Z', 'LOW'),
      item('future-high', '2026-10-23T12:00:00.000Z', 'HIGH'),
      item('overdue', '2026-10-20T12:00:00.000Z'),
      item('other-owner', '2026-10-22T03:00:00.000Z', 'HIGH', 'joao'),
      item('same-time-high', '2026-10-22T02:50:00.000Z', 'HIGH'),
      item('same-time-low', '2026-10-22T02:50:00.000Z', 'LOW'),
      item('next-day', '2026-10-22T03:10:00.000Z')
    ];

    expect(filterAndSortCrmQueue(items, { assigneeId: 'ana', period: 'ALL' }, now).map(({ id }) => id)).toEqual([
      'overdue', 'same-time-high', 'same-time-low', 'next-day', 'future-high', 'future-low'
    ]);
    expect(filterAndSortCrmQueue(items, { assigneeId: 'ana', period: 'FUTURE' }, now).map(({ id }) => id)).toEqual(['next-day', 'future-high', 'future-low']);
  });
});
