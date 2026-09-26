import { expect, test } from 'vitest';
import { visibleLeads } from '../../lib/kanban-visible-leads';

test('hides a returned company immediately even when old server props still contain it', () => {
  const leads = [{ id: 'returned' }, { id: 'remaining' }];

  expect(visibleLeads(leads, ['returned'])).toEqual([{ id: 'remaining' }]);
});

test('keeps other leads and does not change the incoming list', () => {
  const leads = [{ id: 'first' }, { id: 'second' }];

  expect(visibleLeads(leads, ['missing'])).toEqual(leads);
  expect(leads).toHaveLength(2);
});
