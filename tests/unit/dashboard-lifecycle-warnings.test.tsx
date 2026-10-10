import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { lead: { findMany: mocks.findMany } } }));

import { getDashboardLifecycleWarnings } from '@/lib/dashboard-lifecycle-warnings';
import { DashboardLifecycleWarnings } from '@/components/dashboard-lifecycle-warnings';
import type { DashboardLifecycleWarning } from '@/lib/dashboard-lifecycle-warnings';

const now = new Date('2026-10-10T12:00:00.000Z');
const warning: DashboardLifecycleWarning = {
  leadId: 'lead-123',
  leadName: 'Oficina Horizonte',
  currentStage: 'Proposta enviada',
  originStage: 'Qualificado',
  discardAt: new Date('2026-10-11T11:00:00.000Z'),
  daysRemaining: 1,
  remainingTime: 'Vence em menos de 1 dia'
};

describe('dashboard lifecycle warnings', () => {
  beforeEach(() => mocks.findMany.mockReset());

  test('queries a bounded set of due active leads and projects deadline/origin warnings', async () => {
    const overdue = {
      ...warning,
      leadId: 'lead-overdue',
      leadName: 'Oficina Central',
      currentStage: 'Em conversa',
      originStage: 'Abordado',
      discardAt: new Date('2026-10-09T11:00:00.000Z'),
      daysRemaining: -1,
      remainingTime: 'Prazo vencido há 1 dia'
    };
    mocks.findMany.mockResolvedValue([
      { id: warning.leadId, name: warning.leadName, stage: 'PROPOSAL', postFollowUpAt: new Date('2026-10-06T11:00:00.000Z'), followUps: [{ returnStage: 'QUALIFIED' }] },
      { id: overdue.leadId, name: overdue.leadName, stage: 'INTEREST', postFollowUpAt: new Date('2026-10-04T11:00:00.000Z'), followUps: [{ returnStage: 'NEW' }] }
    ]);

    const result = await getDashboardLifecycleWarnings(now);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { postFollowUpAt: { lte: new Date('2026-10-06T12:00:00.000Z') }, stage: { notIn: ['WON', 'DISCARDED'] } },
      orderBy: [{ postFollowUpAt: 'asc' }, { id: 'asc' }],
      take: 10,
      select: expect.objectContaining({
        id: true, name: true, stage: true, postFollowUpAt: true,
        followUps: { where: { state: 'COMPLETED' }, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], take: 1, select: { returnStage: true } }
      })
    }));
    expect(result).toEqual([warning, overdue]);
  });

  test('renders an informational warning with stage, origin, deadline, remaining time, and CRM detail link', () => {
    const html = renderToStaticMarkup(createElement(DashboardLifecycleWarnings, { warnings: [warning] }));

    expect(html).toContain('Atenção aos próximos descartes');
    expect(html).toContain('Este aviso é informativo');
    expect(html).not.toMatch(/aprovar|autorizar|confirmar/i);
    expect(html).toContain('Oficina Horizonte');
    expect(html).toContain('Proposta enviada');
    expect(html).toContain('Qualificado');
    expect(html).toContain('Vence em menos de 1 dia');
    expect(html).toContain('/crm?lead=lead-123');
  });

  test('renders a quiet empty state when no lead is near discard', () => {
    const html = renderToStaticMarkup(createElement(DashboardLifecycleWarnings, { warnings: [] }));

    expect(html).toContain('Nenhum lead próximo do descarte automático.');
    expect(html).not.toContain('aprovar');
  });

  test('does not warn for an advanced lead without an active post-follow-up deadline', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'advanced', name: 'Lead avançado', stage: 'PROPOSAL', postFollowUpAt: null, followUps: [] }]);

    await expect(getDashboardLifecycleWarnings(now)).resolves.toEqual([]);
  });
});
