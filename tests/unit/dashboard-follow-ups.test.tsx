import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { DashboardFollowUps } from '../../components/dashboard-follow-ups';
import type { MetricFollowUp } from '../../lib/metrics';

function followUp(index: number): MetricFollowUp {
  return {
    id: `follow-up-${index}`,
    dueDate: new Date('2026-10-17T12:00:00.000Z'),
    ownerId: 'member-1',
    state: 'PENDING',
    lead: { id: `lead-${index}`, name: `Empresa ${index}` }
  };
}

describe('DashboardFollowUps', () => {
  test('shows three linked companies and puts the rest behind an expandable control', () => {
    const html = renderToStaticMarkup(<DashboardFollowUps
      followUps={[1, 2, 3, 4, 5].map(followUp)}
      empty="Nenhum follow-up vencido."
      nameFor={() => 'João'}
      overdue
    />);
    const collapsedList = html.split('<details>')[0];

    expect(collapsedList).toContain('href="/crm?lead=lead-1"');
    expect(collapsedList).toContain('href="/crm?lead=lead-2"');
    expect(collapsedList).toContain('href="/crm?lead=lead-3"');
    expect(collapsedList).not.toContain('href="/crm?lead=lead-4"');
    expect(html).toContain('<summary');
    expect(html).toContain('Ver mais 2 empresas');
    expect(html).toContain('href="/crm?lead=lead-4"');
    expect(html).toContain('href="/crm?lead=lead-5"');
    expect(html).toContain('group-hover:text-white');
  });

  test('shows the provided empty state when there are no follow-ups', () => {
    const html = renderToStaticMarkup(<DashboardFollowUps
      followUps={[]}
      empty="Nenhum retorno para hoje."
      nameFor={() => 'João'}
    />);

    expect(html).toContain('Nenhum retorno para hoje.');
    expect(html).not.toContain('<details');
  });
});
