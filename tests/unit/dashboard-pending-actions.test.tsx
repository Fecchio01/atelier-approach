import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { getDashboardPendingActions } from '../../lib/dashboard-pending-actions';
import { DashboardPendingActions } from '../../components/dashboard-pending-actions';

const now = new Date('2026-10-14T15:00:00.000Z');

describe('dashboard pending actions', () => {
  test('shows stalled conversation and qualification, plus actionable meeting states', () => {
    const actions = getDashboardPendingActions([
      { id: 'conversation', name: 'Oficina conversa', stage: 'IN_CONVERSATION', stageEnteredAt: new Date('2026-10-10T15:00:00Z'), meetingAt: null, postFollowUpAt: null },
      { id: 'qualified-recent', name: 'Lead recente', stage: 'QUALIFIED', stageEnteredAt: new Date('2026-10-13T15:00:00Z'), meetingAt: null, postFollowUpAt: null },
      { id: 'qualified', name: 'Lead qualificado', stage: 'QUALIFIED', stageEnteredAt: new Date('2026-10-10T15:00:00Z'), meetingAt: null, postFollowUpAt: null },
      { id: 'meeting-missing', name: 'Reunião sem data', stage: 'MEETING', stageEnteredAt: new Date('2026-10-14T14:00:00Z'), meetingAt: null, postFollowUpAt: null },
      { id: 'meeting-soon', name: 'Reunião próxima', stage: 'MEETING', stageEnteredAt: new Date('2026-10-14T14:00:00Z'), meetingAt: new Date('2026-10-15T12:00:00Z'), postFollowUpAt: null },
      { id: 'meeting-overdue', name: 'Reunião vencida', stage: 'MEETING', stageEnteredAt: new Date('2026-10-14T14:00:00Z'), meetingAt: new Date('2026-10-13T12:00:00Z'), postFollowUpAt: null },
      { id: 'meeting-later', name: 'Reunião futura', stage: 'MEETING', stageEnteredAt: new Date('2026-10-14T14:00:00Z'), meetingAt: new Date('2026-10-20T12:00:00Z'), postFollowUpAt: null },
      { id: 'follow-up-cooldown', name: 'Pós retorno', stage: 'IN_CONVERSATION', stageEnteredAt: new Date('2026-10-01T12:00:00Z'), meetingAt: null, postFollowUpAt: new Date('2026-10-12T12:00:00Z') },
      { id: 'won', name: 'Ganho', stage: 'WON', stageEnteredAt: new Date('2026-10-01T12:00:00Z'), meetingAt: null, postFollowUpAt: null }
    ], now);

    expect(actions.map(({ leadId, kind }) => [leadId, kind])).toEqual([
      ['meeting-overdue', 'MEETING_OVERDUE'],
      ['meeting-missing', 'MEETING_UNSCHEDULED'],
      ['conversation', 'STALE_CONVERSATION'],
      ['qualified', 'STALE_QUALIFIED'],
      ['meeting-soon', 'MEETING_SOON']
    ]);
  });

  test('renders a separate actions card with links to the affected CRM records', () => {
    const actions = getDashboardPendingActions([
      { id: 'meeting', name: 'Oficina do Vale', stage: 'MEETING', stageEnteredAt: new Date('2026-10-14T14:00:00Z'), meetingAt: null, postFollowUpAt: null }
    ], now);
    const html = renderToStaticMarkup(React.createElement(DashboardPendingActions, { actions }));

    expect(html).toContain('Ações pendentes');
    expect(html).toContain('Oficina do Vale');
    expect(html).toContain('Agendar reunião');
    expect(html).toContain('/crm?lead=meeting');
  });

  test('does not render an empty card that leaves a hole in the dashboard layout', () => {
    const html = renderToStaticMarkup(React.createElement(DashboardPendingActions, { actions: [] }));

    expect(html).toBe('');
  });
});
