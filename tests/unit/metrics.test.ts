import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

vi.mock('../../lib/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'ana', name: 'Ana' })) }));
vi.mock('../../lib/member-profile', () => ({ getMemberProfiles: vi.fn(async () => [{ id: 'ana', name: 'Ana' }]) }));
vi.mock('../../lib/daily-reports', () => ({ getDailyReportForDate: vi.fn(async () => null) }));
vi.mock('../../components/daily-close-control', () => ({ DailyCloseControl: () => null }));
vi.mock('../../components/team-goal-progress', () => ({ TeamGoalProgress: () => null }));
vi.mock('@phosphor-icons/react/dist/ssr', () => {
  const Icon = () => null;
  return { ArrowRightIcon: Icon, ArrowSquareOutIcon: Icon, CalendarCheckIcon: Icon, ChartBarIcon: Icon,
    CheckCircleIcon: Icon, CurrencyDollarIcon: Icon, FunnelIcon: Icon, MagnifyingGlassIcon: Icon,
    PaperPlaneTiltIcon: Icon, TargetIcon: Icon, UserIcon: Icon, UsersThreeIcon: Icon };
});

import { getDashboardMetrics, getTeamGoalActualsByPeriod, upsertTeamGoal } from '../../lib/metrics';
import { prisma } from '../../lib/db';

const prismaDelegateMethods = [
  { delegate: prisma.teamGoalSettings, methods: { findUnique: prisma.teamGoalSettings.findUnique } },
  { delegate: prisma.goal, methods: { findMany: prisma.goal.findMany } },
  { delegate: prisma.lead, methods: { findMany: prisma.lead.findMany } },
  { delegate: prisma.activity, methods: { findMany: prisma.activity.findMany } },
  { delegate: prisma.stageHistory, methods: { findMany: prisma.stageHistory.findMany } },
  { delegate: prisma.saleEvent, methods: { findMany: prisma.saleEvent.findMany } },
  { delegate: prisma.followUp, methods: { findMany: prisma.followUp.findMany } }
];

function restorePrismaDelegateSpies() {
  vi.restoreAllMocks();
  for (const { delegate, methods } of prismaDelegateMethods) {
    for (const [method, original] of Object.entries(methods)) {
      Object.defineProperty(delegate, method, { configurable: true, writable: true, value: original });
    }
  }
}

describe('dashboard follow-up query and presentation', () => {
  afterEach(() => { restorePrismaDelegateSpies(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  test('dashboard and goal loaders retain legacy sales without reviving reversed-only history', async () => {
    vi.stubGlobal('React', React);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2040-06-06T12:00:00Z'));
    const prefix = `mixed-metrics-${crypto.randomUUID()}`;
    const ids: string[] = [];
    try {
      for (const [suffix, value] of [['active', 500], ['legacy', 200], ['reversed', 900]] as const) {
        const lead = await prisma.lead.create({ data: {
          osmId: `${prefix}-${suffix}`, stage: 'WON', saleValue: value, mrr: value / 10,
          wonAt: new Date(), wonById: 'ana'
        } });
        ids.push(lead.id);
        if (suffix !== 'legacy') await prisma.saleEvent.create({ data: {
          leadId: lead.id, actorId: 'ana', saleValue: value, mrr: value / 10,
          // Even history outside the requested period must suppress legacy fallback.
          occurredAt: suffix === 'reversed' ? new Date('2039-01-01T12:00:00Z') : new Date(),
          reversedAt: suffix === 'reversed' ? new Date() : null
        } });
      }
      const [actuals] = await getTeamGoalActualsByPeriod([{
        kind: 'WEEKLY', start: new Date('2040-06-04T03:00:00Z'), end: new Date('2040-06-11T03:00:00Z')
      }]);
      expect(actuals).toMatchObject({ sales: 2, revenue: 700, mrr: 70 });
      const { default: Home } = await import('../../app/(app)/page');
      const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ period: 'day' }) }));
      expect(html).toContain('2 negócios ganhos');
      expect(html).toContain('R$ 700');
      expect(html).not.toContain('R$ 1.600');
    } finally {
      await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    }
  });

  test('loads five future pending reminders independently of all period completions', async () => {
    vi.stubGlobal('React', React);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
    vi.spyOn(prisma.teamGoalSettings, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.goal, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      { id: 'lead', stage: 'FOLLOW_UP', saleValue: null, mrr: null, wonAt: null, wonById: null }
    ] as never);
    vi.spyOn(prisma.activity, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.stageHistory, 'findMany').mockResolvedValue([]);
    const saleEventQuery = vi.spyOn(prisma.saleEvent, 'findMany').mockResolvedValue([]);
    const completion = { leadId: 'lead', ownerId: 'ana', state: 'COMPLETED', dueDate: new Date('2026-09-10T12:00:00Z'), completedAt: new Date('2026-09-12T10:00:00Z') };
    const followUps = vi.spyOn(prisma.followUp, 'findMany')
      .mockResolvedValueOnce(Array.from({ length: 8 }, (_, index) => ({ ...completion, id: `done-${index}` })) as never)
      .mockResolvedValueOnce([{
        id: 'upcoming', leadId: 'lead', ownerId: 'ana', state: 'PENDING',
        dueDate: new Date('2026-09-13T03:00:00Z'), completedAt: null, lead: { id: 'lead', name: 'Oficina Futura' }
      }] as never);
    const { default: Home } = await import('../../app/(app)/page');
    const html = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ period: 'week' }) }));
    expect(saleEventQuery.mock.calls[0][0]).toMatchObject({ where: { reversedAt: null } });
    expect(followUps.mock.calls[0][0]).not.toHaveProperty('take');
    expect(followUps.mock.calls[0][0]).toMatchObject({ where: { OR: [
      { state: 'PENDING', dueDate: { lt: new Date('2026-09-13T03:00:00Z') } },
      { state: 'COMPLETED', completedAt: { gte: expect.any(Date), lt: expect.any(Date) } }
    ] } });
    expect(followUps.mock.calls[1][0]).toMatchObject({
      where: { state: 'PENDING', dueDate: { gte: new Date('2026-09-13T03:00:00Z') } },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 5
    });
    expect(html).toContain('Próximos');
    expect(html).toContain('Oficina Futura');
    expect(html).toContain('Ana · Retorno em 13/09/2026');
    expect(html).toMatch(/Follow-ups concluídos<\/p><p[^>]*>8<\/p>/);
    expect(html).not.toContain('Reuniões / retornos');
  });
});

describe('getDashboardMetrics', () => {
  afterEach(restorePrismaDelegateSpies);

  test.each([
    ['CONTACT', 'Marcar MEETING na próxima semana'],
    ['CONTACT', 'Etapa alterada para MEETING.'],
    ['STAGE_CHANGE', 'Marcar MEETING na próxima semana'],
    [undefined, 'Marcar MEETING na próxima semana']
  ] as const)('does not infer a meeting from %s activity with note %s', (type, note) => {
    const metrics = getDashboardMetrics([{
      id: 'meeting-mention', stage: 'CONTACTED', saleValue: null, mrr: null, followUps: [],
      activities: [{ actorId: 'ana', type, createdAt: new Date('2026-09-09T10:00:00Z'), note }]
    }], { start: new Date('2026-09-07T03:00:00Z'), end: new Date('2026-09-14T03:00:00Z') });
    expect(metrics.goalActuals.meetings).toBe(0);
  });

  test.each(['STAGE_CHANGE', undefined] as const)('counts a legacy explicit MEETING transition with type %s separately from FOLLOW_UP', (type) => {
    const metrics = getDashboardMetrics([{
      id: 'legacy-meeting', stage: 'FOLLOW_UP', saleValue: null, mrr: null, followUps: [],
      activities: [
        { actorId: 'ana', type, createdAt: new Date('2026-09-09T10:00:00Z'), note: 'Etapa alterada para MEETING.' },
        { actorId: 'ana', type, createdAt: new Date('2026-09-09T11:00:00Z'), note: 'Etapa alterada para FOLLOW_UP.' }
      ]
    }], { start: new Date('2026-09-07T03:00:00Z'), end: new Date('2026-09-14T03:00:00Z') });
    expect(metrics.goalActuals).toMatchObject({ meetings: 1, followUpsCompleted: 0 });
  });

  test('limits upcoming pending follow-ups to five ordered items across São Paulo midnight', () => {
    const pending = (id: string, dueDate: string) => ({ id, ownerId: 'ana', state: 'PENDING' as const, dueDate: new Date(dueDate) });
    const metrics = getDashboardMetrics([{
      id: 'upcoming-lead', stage: 'FOLLOW_UP', saleValue: null, mrr: null, activities: [],
      followUps: [
        pending('sixth', '2026-09-18T03:00:00Z'),
        pending('tomorrow', '2026-09-13T03:00:00Z'),
        pending('fifth', '2026-09-17T03:00:00Z'),
        pending('third', '2026-09-15T03:00:00Z'),
        pending('second', '2026-09-14T03:00:00Z'),
        pending('fourth', '2026-09-16T03:00:00Z'),
        pending('today-end', '2026-09-13T02:59:59.999Z'),
        pending('today-start', '2026-09-12T03:00:00Z'),
        pending('yesterday-end', '2026-09-12T02:59:59.999Z'),
        { ...pending('completed', '2026-09-13T03:00:00Z'), state: 'COMPLETED', completedAt: new Date('2026-09-12T12:00:00Z') },
        { ...pending('cancelled', '2026-09-13T03:00:00Z'), state: 'CANCELLED' }
      ]
    }], { start: new Date('2026-09-07T03:00:00Z'), end: new Date('2026-09-14T03:00:00Z'), now: new Date('2026-09-12T12:00:00Z') });
    expect(metrics.upcoming.map((item) => item.id)).toEqual(['tomorrow', 'second', 'third', 'fourth', 'fifth']);
    expect(metrics.dueToday.map((item) => item.id)).toEqual(['today-end', 'today-start']);
    expect(metrics.overdue.map((item) => item.id)).toEqual(['yesterday-end']);
    expect(metrics.goalActuals.followUpsCompleted).toBe(1);
  });

  test('counts the renamed conversation stage as an interest without counting later stages again', () => {
    const metrics = getDashboardMetrics(
      [{
        id: 'conversation-lead', stage: 'PROPOSAL', saleValue: null, mrr: null, activities: [], followUps: [],
        stageHistory: [
          { actorId: 'ana', toStage: 'IN_CONVERSATION', createdAt: new Date('2026-09-08T10:00:00.000Z') },
          { actorId: 'ana', toStage: 'QUALIFIED', createdAt: new Date('2026-09-09T10:00:00.000Z') },
          { actorId: 'ana', toStage: 'PROPOSAL', createdAt: new Date('2026-09-10T10:00:00.000Z') }
        ]
      }],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z') }
    );

    expect(metrics.personalResults.ana).toMatchObject({ interests: 1, meetings: 0 });
  });

  test('sums won sales and MRR and calculates approach goal progress', () => {
    const metrics = getDashboardMetrics(
      [
        {
          id: 'won-1',
          stage: 'WON',
          saleValue: '1200',
          mrr: '297',
          wonAt: new Date('2026-09-07T10:00:00.000Z'),
          wonById: 'ana',
          activities: [{ actorId: 'ana', createdAt: new Date('2026-09-07T10:00:00.000Z') }],
          followUps: []
        },
        {
          id: 'won-2',
          stage: 'WON',
          saleValue: '800',
          mrr: '297',
          wonAt: new Date('2026-09-08T10:00:00.000Z'),
          wonById: 'bia',
          activities: [{ actorId: 'bia', createdAt: new Date('2026-09-08T10:00:00.000Z') }],
          followUps: []
        },
        {
          id: 'open-1',
          stage: 'INTEREST',
          saleValue: '500',
          mrr: '99',
          activities: [
            { actorId: 'ana', createdAt: new Date('2026-09-09T10:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-09T11:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-09T12:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-10T10:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-10T11:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-10T12:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-11T10:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-11T11:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-11T12:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T10:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T11:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T12:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T13:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T14:00:00.000Z') },
            { actorId: 'ana', createdAt: new Date('2026-09-12T15:00:00.000Z') }
          ],
          followUps: []
        },
        {
          id: 'won-before-week',
          stage: 'WON',
          saleValue: '900',
          mrr: '90',
          wonAt: new Date('2026-08-30T10:00:00.000Z'),
          wonById: 'ana',
          activities: [{ actorId: 'ana', createdAt: new Date('2026-08-30T10:00:00.000Z') }],
          followUps: []
        }
      ],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') }
    );

    expect(metrics.sales).toBe(2000);
    expect(metrics.mrr).toBe(594);
    expect(metrics.goalActuals).toMatchObject({ approaches: 17, sales: 2, revenue: 2000, mrr: 594 });
    expect(metrics.personalResults).toMatchObject({
      ana: { sales: 1200, won: 1 },
      bia: { sales: 800, won: 1 }
    });
  });

  test('excludes reversed sales from revenue, MRR, conversion, and personal results while keeping a later sale', () => {
    const metrics = getDashboardMetrics([{
      id: 'reclosed-lead', stage: 'WON', saleValue: 500, mrr: 50,
      wonAt: new Date('2026-09-10T12:00:00.000Z'), wonById: 'bia',
      activities: [{ actorId: 'ana', type: 'CONTACT', createdAt: new Date('2026-09-08T10:00:00.000Z') }],
      followUps: [],
      saleEvents: [
        { actorId: 'ana', saleValue: 1200, mrr: 120, occurredAt: new Date('2026-09-09T12:00:00.000Z'), reversedAt: new Date('2026-09-10T11:00:00.000Z') },
        { actorId: 'bia', saleValue: 500, mrr: 50, occurredAt: new Date('2026-09-10T12:00:00.000Z'), reversedAt: null }
      ] as never
    }], { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z') });

    expect(metrics).toMatchObject({ sales: 500, mrr: 50, won: 1 });
    expect(metrics.goalActuals).toMatchObject({ sales: 1, revenue: 500, mrr: 50, conversionRate: 100 });
    expect(metrics.personalResults).toEqual({ ana: { approaches: 1, interests: 0, meetings: 0, sales: 0, won: 0 }, bia: { approaches: 0, interests: 0, meetings: 0, sales: 500, won: 1 } });
  });

  test('uses only active sales for team goal actuals', async () => {
    await prisma.lead.deleteMany();
    const lead = await prisma.lead.create({ data: { osmId: 'goal-reversed-sale', stage: 'CONTACTED' } });
    await prisma.saleEvent.createMany({ data: [
      { leadId: lead.id, actorId: 'ana', saleValue: 1200, mrr: 120, occurredAt: new Date('2026-09-09T12:00:00Z'), reversedAt: new Date('2026-09-10T12:00:00Z'), reversedById: 'bia' },
      { leadId: lead.id, actorId: 'bia', saleValue: 500, mrr: 50, occurredAt: new Date('2026-09-11T12:00:00Z') }
    ] });

    const [actuals] = await getTeamGoalActualsByPeriod([{
      kind: 'WEEKLY', start: new Date('2026-09-07T03:00:00Z'), end: new Date('2026-09-14T03:00:00Z')
    }]);

    expect(actuals).toMatchObject({ sales: 1, revenue: 500, mrr: 50 });
  });

  test('does not count an old win again after a current-week activity', () => {
    const metrics = getDashboardMetrics(
      [{
        id: 'historic-win', stage: 'WON', saleValue: 900, mrr: 90,
        wonAt: new Date('2026-08-30T10:00:00.000Z'), wonById: 'ana',
        activities: [
          { actorId: 'ana', createdAt: new Date('2026-08-30T10:00:00.000Z') },
          { actorId: 'bia', createdAt: new Date('2026-09-12T16:00:00.000Z') }
        ],
        followUps: []
      }],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z') }
    );

    expect(metrics).toMatchObject({ sales: 0, mrr: 0, won: 0, personalResults: { bia: { approaches: 1, sales: 0, won: 0 } } });
  });

  test('separates pending follow-ups due today from overdue work', () => {
    const metrics = getDashboardMetrics(
      [{
        id: 'lead-1', stage: 'FOLLOW_UP', saleValue: null, mrr: null, activities: [],
        followUps: [
          { id: 'today', ownerId: 'ana', state: 'PENDING', dueDate: new Date('2026-09-12T09:00:00.000Z') },
          { id: 'overdue', ownerId: 'ana', state: 'PENDING', dueDate: new Date('2026-09-11T09:00:00.000Z') },
          { id: 'finished', ownerId: 'ana', state: 'COMPLETED', dueDate: new Date('2026-09-10T09:00:00.000Z') }
        ]
      }],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') }
    );

    expect(metrics.dueToday.map((followUp) => followUp.id)).toEqual(['today']);
    expect(metrics.overdue.map((followUp) => followUp.id)).toEqual(['overdue']);
  });

  test('counts completed follow-ups by completion time instead of the scheduled due date', () => {
    const metrics = getDashboardMetrics([{
      id: 'completed-follow-up', stage: 'FOLLOW_UP', saleValue: null, mrr: null, activities: [],
      followUps: [{
        id: 'completed', ownerId: 'ana', state: 'COMPLETED',
        dueDate: new Date('2026-09-01T12:00:00.000Z'),
        completedAt: new Date('2026-09-10T12:00:00.000Z')
      }]
    }], { start: new Date('2026-09-07T03:00:00.000Z'), end: new Date('2026-09-14T03:00:00.000Z') });

    expect(metrics.goalActuals.followUpsCompleted).toBe(1);
  });

  test('keeps legacy follow-up notes out of meeting goal progress', () => {
    const metrics = getDashboardMetrics(
      [{
        id: 'qualified-lead', stage: 'WON', saleValue: 500, mrr: 50,
        wonAt: new Date('2026-09-10T10:00:00.000Z'), wonById: 'ana',
        activities: [
          { actorId: 'ana', createdAt: new Date('2026-09-08T10:00:00.000Z'), note: 'Etapa alterada para INTEREST.' },
          { actorId: 'ana', createdAt: new Date('2026-09-09T10:00:00.000Z'), note: 'Etapa alterada para FOLLOW_UP.' }
        ],
        followUps: []
      }],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z') }
    );

    expect(metrics.goalActuals).toMatchObject({ approaches: 2, interests: 1, meetings: 0, sales: 1, revenue: 500, mrr: 50 });
    expect(metrics.personalResults.ana).toMatchObject({ approaches: 2, interests: 1, meetings: 0, won: 1, sales: 500 });
  });

  test('counts explicit meeting history without treating follow-ups as meetings', () => {
    const metrics = getDashboardMetrics([{
      id: 'meeting-history', stage: 'FOLLOW_UP', saleValue: null, mrr: null, activities: [], followUps: [],
      stageHistory: [
        { actorId: 'ana', toStage: 'INTEREST', createdAt: new Date('2026-09-08T10:00:00.000Z') },
        { actorId: 'ana', toStage: 'MEETING', createdAt: new Date('2026-09-09T10:00:00.000Z') },
        { actorId: 'bia', toStage: 'FOLLOW_UP', createdAt: new Date('2026-09-10T10:00:00.000Z') }
      ]
    }], { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z') });
    expect(metrics.goalActuals).toMatchObject({ interests: 1, meetings: 1 });
    expect(metrics.personalResults.ana).toMatchObject({ interests: 1, meetings: 1 });
    expect(metrics.personalResults.bia).toBeUndefined();
  });

  test('updates the existing team goal for the same period', async () => {
    const period = { kind: 'WEEKLY' as const, start: new Date('2026-09-07T03:00:00.000Z'), end: new Date('2026-09-14T03:00:00.000Z') };
    const targets = (approaches: number, interests: number, meetings: number, sales: number, revenue: number) => ({
      approaches, interests, meetings, sales, revenue, mrr: null, followUpsCompleted: null, conversionRate: null
    });
    await prisma.goal.deleteMany();

    await upsertTeamGoal(period, targets(10, 2, 1, 1, 1000));
    const updated = await upsertTeamGoal(period, targets(15, 4, 2, 2, 2000));

    expect(updated).toMatchObject({ ownerId: '__team__', periodKind: 'WEEKLY', periodStart: period.start, periodEnd: period.end, approachesTarget: 15, interestsTarget: 4, meetingsTarget: 2, salesTarget: 2, revenueTarget: 2000 });
    expect(await prisma.goal.count()).toBe(1);
  });

  test('saves custom goal target and manual progress on the selected team cycle', async () => {
    const period = { kind: 'WEEKLY' as const, start: new Date('2026-09-21T03:00:00.000Z'), end: new Date('2026-09-28T03:00:00.000Z') };
    await prisma.goal.deleteMany();

    const customGoals = [{ id: 'metric-1', name: 'Carros', unit: 'unidades', target: 3, current: 1, icon: 'car' as const }];
    const saved = await upsertTeamGoal(period, {
      approaches: 9, interests: null, meetings: null, sales: null,
      revenue: null, mrr: null, followUpsCompleted: null, conversionRate: null
    }, undefined, customGoals);

    expect(saved).toMatchObject({
      ownerId: '__team__',
      approachesTarget: 9,
      customGoals: [{ id: 'metric-1', name: 'Carros', unit: 'unidades', target: 3, current: 1, icon: 'car' }]
    });
  });

  test('keeps legacy personal goals stored separately from team goal writes', async () => {
    const period = { kind: 'WEEKLY' as const, start: new Date('2026-09-14T03:00:00.000Z'), end: new Date('2026-09-21T03:00:00.000Z') };
    await prisma.goal.deleteMany();

    await prisma.goal.create({ data: {
      ownerId: 'ana', periodKind: 'WEEKLY', periodStart: period.start, periodEnd: period.end,
      approachesTarget: 8, interestsTarget: 2, meetingsTarget: 1, salesTarget: 1, revenueTarget: 1200,
      mrrTarget: null, followUpsCompletedTarget: null, conversionRateTarget: null
    } });
    await upsertTeamGoal(period, { approaches: 30, interests: 6, meetings: 4, sales: 3, revenue: 5000, mrr: null, followUpsCompleted: null, conversionRate: null });

    expect(await prisma.goal.findMany({ orderBy: { ownerId: 'asc' } })).toMatchObject([
      { ownerId: '__team__', periodKind: 'WEEKLY', approachesTarget: 30, interestsTarget: 6, meetingsTarget: 4, salesTarget: 3, revenueTarget: 5000 },
      { ownerId: 'ana', periodKind: 'WEEKLY', approachesTarget: 8, interestsTarget: 2, meetingsTarget: 1, salesTarget: 1, revenueTarget: 1200 }
    ]);
  });
});
