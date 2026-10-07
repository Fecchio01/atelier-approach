import { describe, expect, it } from 'vitest';

import { getTeamGoalActualsByPeriod } from '../../lib/metrics';

describe('dashboard metric query concurrency', () => {
  it('limits the lead scan to legacy won leads in the requested period', async () => {
    let leadQuery: unknown;
    const database = {
      lead: { findMany: async (query: unknown) => { leadQuery = query; return []; } },
      activity: { findMany: async () => [] },
      stageHistory: { findMany: async () => [] },
      saleEvent: { findMany: async () => [] },
      followUp: { findMany: async () => [] }
    } as unknown as Parameters<typeof getTeamGoalActualsByPeriod>[2];
    const period = { kind: 'WEEKLY' as const, start: new Date('2026-10-05T00:00:00.000Z'), end: new Date('2026-10-12T00:00:00.000Z') };

    await getTeamGoalActualsByPeriod([period], new Date('2026-10-07T12:00:00.000Z'), database);

    expect(leadQuery).toMatchObject({
      where: {
        stage: 'WON',
        wonAt: { gte: period.start, lt: period.end },
        saleEvents: { none: {} }
      }
    });
  });

  it('starts all independent metric reads before awaiting any result', async () => {
    const started: string[] = [];
    const resolvers: (() => void)[] = [];
    const delayedRead = (name: string) => {
      started.push(name);
      return new Promise<never[]>((resolve) => resolvers.push(() => resolve([])));
    };
    const database = {
      lead: { findMany: () => delayedRead('leads') },
      activity: { findMany: () => delayedRead('activities') },
      stageHistory: { findMany: () => delayedRead('stageHistory') },
      saleEvent: { findMany: () => delayedRead('saleEvents') },
      followUp: { findMany: () => delayedRead('followUps') }
    } as unknown as Parameters<typeof getTeamGoalActualsByPeriod>[2];
    const now = new Date('2026-10-07T12:00:00.000Z');
    const period = { kind: 'WEEKLY' as const, start: new Date('2026-10-05T00:00:00.000Z'), end: new Date('2026-10-12T00:00:00.000Z') };

    const result = getTeamGoalActualsByPeriod([period], now, database);
    await Promise.resolve();

    expect(started).toEqual(['leads', 'activities', 'stageHistory', 'saleEvents', 'followUps']);
    resolvers.forEach((resolve) => resolve());
    await expect(result).resolves.toHaveLength(1);
  });
});
