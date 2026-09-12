import { describe, expect, test } from 'vitest';

import { getDashboardMetrics, upsertWeeklyGoal } from '../../lib/metrics';
import { prisma } from '../../lib/db';

describe('getDashboardMetrics', () => {
  test('sums won sales and MRR and calculates approach goal progress', () => {
    const metrics = getDashboardMetrics(
      [
        {
          id: 'won-1',
          stage: 'WON',
          saleValue: '1200',
          mrr: '297',
          activities: [{ actorId: 'ana', createdAt: new Date('2026-09-07T10:00:00.000Z') }],
          followUps: []
        },
        {
          id: 'won-2',
          stage: 'WON',
          saleValue: '800',
          mrr: '297',
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
          activities: [{ actorId: 'ana', createdAt: new Date('2026-08-30T10:00:00.000Z') }],
          followUps: []
        }
      ],
      [{ ownerId: null, weekStart: new Date('2026-09-07T00:00:00.000Z'), approachesTarget: 25, revenueTarget: 3000 }],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') }
    );

    expect(metrics.sales).toBe(2000);
    expect(metrics.mrr).toBe(594);
    expect(metrics.goalProgress.approaches).toBe(0.68);
    expect(metrics.goalProgress.revenue).toBeCloseTo(0.67, 2);
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
      [],
      { start: new Date('2026-09-07T00:00:00.000Z'), end: new Date('2026-09-14T00:00:00.000Z'), now: new Date('2026-09-12T12:00:00.000Z') }
    );

    expect(metrics.dueToday.map((followUp) => followUp.id)).toEqual(['today']);
    expect(metrics.overdue.map((followUp) => followUp.id)).toEqual(['overdue']);
  });

  test('updates the existing weekly goal for the same owner and week', async () => {
    const weekStart = new Date('2026-09-07T00:00:00.000Z');
    await prisma.goal.deleteMany();

    await upsertWeeklyGoal({ ownerId: 'ana', weekStart, approachesTarget: 10, revenueTarget: 1000 });
    const updated = await upsertWeeklyGoal({ ownerId: 'ana', weekStart, approachesTarget: 15, revenueTarget: 2000 });

    expect(updated).toMatchObject({ ownerId: 'ana', approachesTarget: 15, revenueTarget: 2000 });
    expect(await prisma.goal.count()).toBe(1);
  });
});
