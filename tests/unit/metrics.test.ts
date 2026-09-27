import { describe, expect, test } from 'vitest';

import { getDashboardMetrics, upsertTeamGoal } from '../../lib/metrics';
import { prisma } from '../../lib/db';

describe('getDashboardMetrics', () => {
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

  test('tracks interest, meeting, and sales-count goal progress for the team and each member', () => {
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

    expect(metrics.goalActuals).toMatchObject({ approaches: 2, interests: 1, meetings: 1, sales: 1, revenue: 500, mrr: 50 });
    expect(metrics.personalResults.ana).toMatchObject({ approaches: 2, interests: 1, meetings: 1, won: 1, sales: 500 });
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
