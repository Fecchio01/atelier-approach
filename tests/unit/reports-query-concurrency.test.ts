import { describe, expect, it, vi } from 'vitest';

const { database } = vi.hoisted(() => ({
  database: {
    lead: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
    followUp: { findMany: vi.fn() },
    saleEvent: { findMany: vi.fn() },
    stageHistory: { findMany: vi.fn() }
  }
}));

vi.mock('../../lib/db', () => ({ prisma: database }));

import { buildReport } from '../../lib/reports';

describe('report query concurrency', () => {
  it('starts the five independent report reads before awaiting any result', async () => {
    const started: string[] = [];
    const resolvers: (() => void)[] = [];
    const delayedRead = (name: string) => {
      started.push(name);
      return new Promise<never[]>((resolve) => resolvers.push(() => resolve([])));
    };

    database.lead.findMany.mockImplementation(() => delayedRead('leads'));
    database.activity.findMany.mockImplementation(() => delayedRead('activities'));
    database.followUp.findMany.mockImplementation(() => delayedRead('followUps'));
    database.saleEvent.findMany.mockImplementation(() => delayedRead('saleEvents'));
    database.stageHistory.findMany.mockImplementation(() => delayedRead('stageHistory'));

    const report = buildReport({ from: new Date('2026-10-05T00:00:00Z'), to: new Date('2026-10-12T00:00:00Z') });
    await Promise.resolve();

    expect(started).toEqual(['leads', 'activities', 'followUps', 'saleEvents', 'stageHistory']);
    resolvers.forEach((resolve) => resolve());
    await expect(report).resolves.toMatchObject({ conversion: { approaches: 0, wins: 0 } });
  });
});
