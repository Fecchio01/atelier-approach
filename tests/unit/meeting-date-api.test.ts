import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const lead: Record<string, unknown> = {};
  const tx = {
    $queryRaw: vi.fn(),
    lead: {
      findUnique: vi.fn(async () => lead),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(lead, data))
    },
    stageHistory: { create: vi.fn(async () => ({})) },
    activity: { create: vi.fn(async () => ({})) },
    followUp: { updateMany: vi.fn(async () => ({ count: 0 })) },
    saleEvent: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    serviceCatalogItem: { findMany: vi.fn(async () => []) }
  };
  return {
    user: vi.fn(async () => ({ id: 'member-1' })),
    lead,
    tx,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  };
});

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/db', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../../lib/commercial-settings', () => ({ getFollowUpDelayDays: vi.fn(async () => 2) }));

import { PATCH } from '../../app/api/leads/[id]/route';

const patch = (body: Record<string, unknown>) => PATCH(new Request('http://localhost/api/leads/meeting-lead', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}), { params: Promise.resolve({ id: 'meeting-lead' }) });

describe('meeting date API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mocks.lead, {
      id: 'meeting-lead', stage: 'PROPOSAL', stageEnteredAt: new Date('2026-10-10T12:00:00.000Z'),
      postFollowUpAt: null, discardedAt: null, meetingAt: null, saleValue: null, mrr: null, wonAt: null, wonById: null
    });
  });

  test('saves the selected meeting date while moving a proposal into Reunião', async () => {
    const response = await patch({ stage: 'MEETING', meetingAt: '2026-10-15T12:00:00.000Z' });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ lead: { stage: 'MEETING', meetingAt: '2026-10-15T12:00:00.000Z' } });
    expect(mocks.tx.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'MEETING', meetingAt: new Date('2026-10-15T12:00:00.000Z') }) }));
  });

  test('updates or clears a meeting date while the lead is already in Reunião', async () => {
    mocks.lead.stage = 'MEETING';
    mocks.lead.meetingAt = new Date('2026-10-15T12:00:00.000Z');

    expect((await patch({ meetingAt: '2026-10-16T12:00:00.000Z' })).status).toBe(200);
    expect(mocks.lead.meetingAt).toEqual(new Date('2026-10-16T12:00:00.000Z'));
    expect((await patch({ meetingAt: null })).status).toBe(200);
    expect(mocks.lead.meetingAt).toBeNull();
  });

  test('rejects invalid dates and prevents setting a meeting date outside Reunião', async () => {
    expect((await patch({ stage: 'MEETING', meetingAt: 'invalid' })).status).toBe(400);
    expect((await patch({ meetingAt: '2026-10-15T12:00:00.000Z' })).status).toBe(409);
    expect(mocks.lead.stage).toBe('PROPOSAL');
  });
});
