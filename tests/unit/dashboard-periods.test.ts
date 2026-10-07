import { describe, expect, test } from 'vitest';
import { createElement } from 'react';

import { getDashboardDataFetchWindow, getGoalPeriodWindow, selectDashboardWindow, selectGoalPeriod } from '../../lib/goal-periods';
import { getDashboardTrend, getDashboardTrendPointIndex, getDashboardTrendPointX } from '../../lib/dashboard-trend';
import { DashboardTrendChart } from '../../components/dashboard-trend-chart';
import { renderToStaticMarkup } from 'react-dom/server';

describe('dashboard period selection', () => {
  test('fetch window covers the active weekly and monthly periods without a serial settings read', () => {
    const now = new Date('2026-10-07T15:00:00.000Z');
    const fetchWindow = getDashboardDataFetchWindow(now);

    for (const monthlyStartDay of [1, 14, 31]) {
      const weekly = getGoalPeriodWindow('WEEKLY', now, monthlyStartDay);
      const monthly = getGoalPeriodWindow('MONTHLY', now, monthlyStartDay);
      expect(fetchWindow.from.getTime()).toBeLessThanOrEqual(Math.min(weekly.start.getTime(), monthly.start.getTime()));
      expect(fetchWindow.to.getTime()).toBeGreaterThanOrEqual(Math.max(weekly.end.getTime(), monthly.end.getTime()));
    }
  });

  test('uses the saved monthly transition bounds instead of recalculating the configured anchor', () => {
    const now = new Date('2026-09-20T15:00:00.000Z');
    const weekly = getGoalPeriodWindow('WEEKLY', now, 14);
    const savedTransition = {
      kind: 'MONTHLY' as const,
      start: new Date('2026-09-14T03:00:00.000Z'),
      end: new Date('2026-10-05T03:00:00.000Z')
    };

    expect(selectDashboardWindow('month', now, weekly, savedTransition)).toEqual({
      start: savedTransition.start,
      end: savedTransition.end
    });
  });

  test('keeps an explicitly requested old report cycle instead of falling back to the current one', () => {
    const activeGoal = { periodStart: new Date('2026-09-14T03:00:00.000Z'), id: 'active' };
    const oldGoal = { periodStart: new Date('2022-01-14T03:00:00.000Z'), id: 'old' };

    expect(selectGoalPeriod(oldGoal.periodStart, oldGoal, activeGoal)).toBe(oldGoal);
    expect(selectGoalPeriod(new Date('2021-01-01T00:00:00.000Z'), null, activeGoal)).toBeNull();
    expect(selectGoalPeriod(null, null, activeGoal)).toBe(activeGoal);
  });
});

describe('dashboard trend data', () => {
  test('maps cursor positions to the matching day column, including Monday and the chart edges', () => {
    expect(getDashboardTrendPointIndex(0, 7)).toBe(0);
    expect(getDashboardTrendPointIndex(0.07, 7)).toBe(0);
    expect(getDashboardTrendPointIndex(0.21, 7)).toBe(1);
    expect(getDashboardTrendPointIndex(0.99, 7)).toBe(6);
    expect(getDashboardTrendPointIndex(1, 7)).toBe(6);
    expect(getDashboardTrendPointIndex(1.4, 7)).toBe(6);
    expect(getDashboardTrendPointIndex(0.5, 0)).toBeNull();
    expect(getDashboardTrendPointIndex(Number.NaN, 7)).toBeNull();
  });

  test('places points at the centers of their matching day-label columns', () => {
    expect(getDashboardTrendPointX(0, 7, 1000)).toBeCloseTo(1000 / 14);
    expect(getDashboardTrendPointX(3, 7, 1000)).toBeCloseTo(500);
    expect(getDashboardTrendPointX(6, 7, 1000)).toBeCloseTo(1000 * 13 / 14);
    expect(getDashboardTrendPointX(0, 1, 1000)).toBe(500);
  });

  test('groups daily approaches and interest transitions into six four-hour windows', () => {
    const range = { start: new Date('2026-10-07T03:00:00.000Z'), end: new Date('2026-10-08T03:00:00.000Z') };
    const trend = getDashboardTrend([{
      id: 'daily-lead', stage: 'CONTACTED', saleValue: null, mrr: null, followUps: [],
      activities: [
        { actorId: 'ana', type: 'CONTACT', createdAt: new Date('2026-10-07T04:30:00.000Z') },
        { actorId: 'ana', type: 'FOLLOW_UP_SCHEDULED', createdAt: new Date('2026-10-07T04:45:00.000Z') }
      ],
      stageHistory: [{ actorId: 'ana', toStage: 'INTEREST', createdAt: new Date('2026-10-07T08:15:00.000Z') }]
    }], range, 'day');

    expect(trend).toHaveLength(6);
    expect(trend.map(({ label }) => label)).toEqual(['00h', '04h', '08h', '12h', '16h', '20h']);
    expect(trend[0]).toMatchObject({ approaches: 1, interests: 0 });
    expect(trend[1]).toMatchObject({ approaches: 0, interests: 1 });
    expect(trend.slice(2).every(({ approaches, interests }) => approaches === 0 && interests === 0)).toBe(true);
  });

  test('uses legacy stage-change notes when structured history is absent', () => {
    const trend = getDashboardTrend([{
      id: 'legacy-lead', stage: 'CONTACTED', saleValue: null, mrr: null, followUps: [],
      activities: [
        { actorId: 'ana', createdAt: new Date('2026-10-05T13:00:00.000Z'), note: 'Etapa alterada para INTEREST.' },
        { actorId: 'ana', createdAt: new Date('2026-10-05T14:00:00.000Z'), note: 'Etapa alterada para MEETING.' }
      ]
    }], {
      start: new Date('2026-10-05T03:00:00.000Z'), end: new Date('2026-10-12T03:00:00.000Z')
    }, 'week');

    expect(trend).toHaveLength(7);
    expect(trend[0]).toMatchObject({ approaches: 2, interests: 1 });
  });

  test('summarizes a monthly cycle into readable seven-day groups', () => {
    const trend = getDashboardTrend([{
      id: 'monthly-lead', stage: 'CONTACTED', saleValue: null, mrr: null, followUps: [],
      activities: [
        { actorId: 'ana', type: 'CONTACT', createdAt: new Date('2026-10-02T15:00:00.000Z') },
        { actorId: 'ana', type: 'CONTACT', createdAt: new Date('2026-10-10T15:00:00.000Z') },
        { actorId: 'ana', type: 'CONTACT', createdAt: new Date('2026-10-31T15:00:00.000Z') }
      ]
    }], {
      start: new Date('2026-10-01T03:00:00.000Z'), end: new Date('2026-11-01T03:00:00.000Z')
    }, 'month');

    expect(trend.map(({ label }) => label)).toEqual(['01–07', '08–14', '15–21', '22–28', '29–31']);
    expect(trend.map(({ approaches }) => approaches)).toEqual([1, 1, 0, 0, 1]);
  });

  test('renders an accessible legend, period context, and clear empty state', () => {
    const html = renderToStaticMarkup(createElement(DashboardTrendChart, {
      data: [{ label: 'seg 05', approaches: 0, interests: 0 }], periodLabel: 'Esta semana'
    }));

    expect(html).toContain('Ritmo de prospecção');
    expect(html).not.toContain('Ver exemplo com linhas separadas');
    expect(html).not.toContain('Prévia visual: abordagens simuladas');
    expect(html).toContain('Abordagens');
    expect(html).toContain('Interesses');
    expect(html).toContain('Nenhuma movimentação registrada neste período.');
    expect(html).toContain('seg 05: 0 abordagens e 0 interesses');
    expect(html).toContain('data-dashboard-motion-card="section"');
    expect(html).toContain('bg-[var(--atelier-surface)]');
  });

  test('renders interactive chart lines and points when the period has activity', () => {
    const html = renderToStaticMarkup(createElement(DashboardTrendChart, {
      data: [
        { label: 'seg 05', approaches: 2, interests: 1 },
        { label: 'ter 06', approaches: 3, interests: 2 }
      ], periodLabel: 'Esta semana'
    }));

    expect(html).toContain('data-testid="dashboard-approaches-segment-0"');
    expect(html).toContain('data-testid="dashboard-interests-segment-0"');
    expect(html).toContain('seg 05: 2 abordagens e 1 interesses');
    expect(html).toContain('Passe o cursor pelo gráfico para traçar os resultados dia a dia.');
    expect(html).toContain('Interesses · linha contínua');
    expect(html).not.toContain('stroke-dasharray="7 5"');
  });
});
