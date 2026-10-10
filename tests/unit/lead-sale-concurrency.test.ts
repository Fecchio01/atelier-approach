import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

// Authentication is the only boundary replaced: transactions, row locks,
// reads, writes and snapshots all execute against the isolated PostgreSQL DB.
vi.mock('../../lib/auth', () => ({ getCurrentUser: async () => ({ id: 'concurrency-member' }) }));
import { PATCH } from '../../app/api/leads/[id]/route';
import { prisma } from '../../lib/db';

describe('PostgreSQL sale row-lock concurrency', () => {
const leadIds: string[] = [];
const serviceIds: string[] = [];
beforeAll(async () => {
  expect(new URL(process.env.DATABASE_URL!).searchParams.get('schema')).toBe('atelier_test');
  const [schema] = await prisma.$queryRaw<{ current_schema: string }[]> `SELECT current_schema()`;
  expect(schema.current_schema).toBe('atelier_test');
});
afterEach(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: leadIds.splice(0) } } });
  await prisma.serviceCatalogItem.deleteMany({ where: { id: { in: serviceIds.splice(0) } } });
});

async function fixture() {
  const prefix = `concurrent-${randomUUID()}`;
  const lead = await prisma.lead.create({ data: { osmId: prefix, stage: 'CONTACTED' } });
  leadIds.push(lead.id);
  const monthly = await prisma.serviceCatalogItem.create({ data: { name: `${prefix}-monthly`, price: '199.90', billingType: 'MONTHLY' } });
  serviceIds.push(monthly.id);
  const setup = await prisma.serviceCatalogItem.create({ data: { name: `${prefix}-setup`, price: '500.01', billingType: 'ONE_TIME' } });
  serviceIds.push(setup.id);
  return { lead, monthly, setup };
}
function patch(id: string, stage: 'WON' | 'CONTACTED', ids?: string[]) {
  return PATCH(new Request(`http://localhost/api/leads/${id}`, {
    method: 'PATCH', body: JSON.stringify({ stage, ...(ids ? { serviceIds: ids } : {}) })
  }), { params: Promise.resolve({ id }) });
}
async function state(id: string) {
  return prisma.lead.findUniqueOrThrow({ where: { id }, include: {
    saleEvents: { include: { lineItems: true } }, activities: true, stageHistory: true
  } });
}
function assertSnapshots(result: Awaited<ReturnType<typeof state>>, services: Awaited<ReturnType<typeof fixture>>) {
  for (const sale of result.saleEvents) {
    expect(Number(sale.saleValue)).toBe(699.91);
    expect(Number(sale.mrr)).toBe(199.9);
    expect(sale.actorId).toBe('concurrency-member');
    expect(sale.lineItems.map((item) => ({
      serviceId: item.serviceId, name: item.serviceName, price: Number(item.price), type: item.billingType
    })).sort((a, b) => a.price - b.price)).toEqual([
      { serviceId: services.monthly.id, name: services.monthly.name, price: 199.9, type: 'MONTHLY' },
      { serviceId: services.setup.id, name: services.setup.name, price: 500.01, type: 'ONE_TIME' }
    ]);
  }
}

test('concurrent duplicate PATCH closes persist exactly one complete sale under PostgreSQL row lock', async () => {
  const data = await fixture();
  const ids = [data.monthly.id, data.setup.id];
  const responses = await Promise.all([patch(data.lead.id, 'WON', ids), patch(data.lead.id, 'WON', ids)]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const result = await state(data.lead.id);
  expect(result.stage).toBe('WON');
  expect(Number(result.saleValue)).toBe(699.91);
  expect(Number(result.mrr)).toBe(199.9);
  expect(result.saleEvents).toHaveLength(1);
  expect(result.saleEvents[0].reversedAt).toBeNull();
  expect(result.stageHistory.map((event) => [event.fromStage, event.toStage])).toEqual([['CONTACTED', 'WON']]);
  expect(result.activities.map((activity) => activity.type)).toEqual(['SALE_WON']);
  assertSnapshots(result, data);
});

test.each(['CONTACTED', 'WON'] as const)('concurrent close/reopen from %s yields only a serially valid state', async (initial) => {
  const data = await fixture();
  const ids = [data.monthly.id, data.setup.id];
  if (initial === 'WON') expect((await patch(data.lead.id, 'WON', ids)).status).toBe(200);
  const [close, reopen] = await Promise.all([patch(data.lead.id, 'WON', ids), patch(data.lead.id, 'CONTACTED')]);
  expect(reopen.status).toBe(200);
  const result = await state(data.lead.id);
  const active = result.saleEvents.filter((event) => !event.reversedAt);
  const reversed = result.saleEvents.filter((event) => event.reversedAt);
  const wins = result.activities.filter((activity) => activity.type === 'SALE_WON');
  const reversals = result.activities.filter((activity) => activity.type === 'SALE_REVERSED');
  const transitions = result.stageHistory.map((event) => `${event.fromStage}>${event.toStage}`).sort();
  if (initial === 'CONTACTED') {
    expect(close.status).toBe(200);
    expect(result.saleEvents).toHaveLength(1);
    expect(wins).toHaveLength(1);
    if (result.stage === 'WON') {
      expect(active).toHaveLength(1);
      expect(reversed).toHaveLength(0);
      expect(transitions).toEqual(['CONTACTED>WON']);
    } else {
      expect(result.stage).toBe('CONTACTED');
      expect(active).toHaveLength(0);
      expect(reversed).toHaveLength(1);
      expect(transitions).toEqual(['CONTACTED>WON', 'WON>CONTACTED']);
    }
  } else if (result.stage === 'WON') {
    expect(close.status).toBe(200);
    expect(active).toHaveLength(1);
    expect(reversed).toHaveLength(1);
    expect(wins).toHaveLength(2);
    expect(transitions).toEqual(['CONTACTED>WON', 'CONTACTED>WON', 'WON>CONTACTED']);
  } else {
    expect(result.stage).toBe('CONTACTED');
    expect(close.status).toBe(409);
    expect(active).toHaveLength(0);
    expect(reversed).toHaveLength(1);
    expect(wins).toHaveLength(1);
    expect(transitions).toEqual(['CONTACTED>WON', 'WON>CONTACTED']);
  }
  expect(reversals).toHaveLength(reversed.length);
  expect(result.activities.filter((activity) => activity.type === 'LEAD_REOPENED')).toHaveLength(reversed.length);
  for (const event of reversed) expect(event.reversedById).toBe('concurrency-member');
  expect(result.saleEvents).toHaveLength(active.length + reversed.length);
  if (active.length) {
    expect(Number(result.saleValue)).toBe(699.91);
    expect(Number(result.mrr)).toBe(199.9);
    expect(result.wonAt).not.toBeNull();
  } else {
    expect(result).toMatchObject({ saleValue: null, mrr: null, wonAt: null, wonById: null });
  }
  assertSnapshots(result, data);
});
});

describe('concurrent follow-up completion without database', () => {
  let lead: { id: string; stage: string; stageEnteredAt: Date; postFollowUpAt: Date | null; discardedAt: Date | null };
  let followUp: { id: string; leadId: string; ownerId: string; dueDate: Date; state: string; returnStage: string | null; note: string; completedAt: Date | null; completedById: string | null };
  let activities: { type: string; note: string }[];
  let transitions: { fromStage: string; toStage: string }[];
  let lockCalls: number;
  let lockQueue: Promise<void>;

  beforeEach(() => {
    lead = { id: 'completion-race-lead', stage: 'FOLLOW_UP', stageEnteredAt: new Date('2026-09-01T10:00:00Z'), postFollowUpAt: null, discardedAt: null };
    followUp = { id: 'completion-race-follow-up', leadId: lead.id, ownerId: 'concurrency-member', dueDate: new Date('2026-09-02T10:00:00Z'), state: 'PENDING', returnStage: 'CONTACTED', note: 'Retornar.', completedAt: null, completedById: null };
    activities = [];
    transitions = [];
    lockCalls = 0;
    lockQueue = Promise.resolve();

    vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (client: object) => Promise<unknown>) => {
      let releaseLock = () => {};
      const tx = {
        $queryRaw: async () => {
          lockCalls += 1;
          const previous = lockQueue;
          lockQueue = new Promise<void>((resolve) => { releaseLock = resolve; });
          await previous;
          return [{ id: lead.id }];
        },
        lead: {
          findUnique: async () => ({ ...lead }),
          update: async ({ data }: { data: Partial<typeof lead> }) => { Object.assign(lead, data); return { ...lead }; }
        },
        followUp: {
          findFirst: async ({ where }: { where: { id: string; leadId: string } }) => where.id === followUp.id && where.leadId === followUp.leadId ? { ...followUp } : null,
          update: async ({ data }: { data: Partial<typeof followUp> }) => { Object.assign(followUp, data); return { ...followUp }; }
        },
        stageHistory: { create: async ({ data }: { data: { fromStage: string; toStage: string } }) => { transitions.push(data); return data; } },
        activity: { create: async ({ data }: { data: { type: string; note: string } }) => { activities.push(data); return data; } }
      };
      try {
        return await callback(tx);
      } finally {
        releaseLock();
      }
    }) as never);
  });

  afterEach(() => vi.restoreAllMocks());

  test('serializes duplicate completion so only one completion activity and return transition are recorded', async () => {
    const patch = () => PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ followUpAction: 'COMPLETE', followUpId: followUp.id })
    }), { params: Promise.resolve({ id: lead.id }) });

    const responses = await Promise.all([patch(), patch()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(lockCalls).toBe(2);
    expect(lead).toMatchObject({ stage: 'CONTACTED', postFollowUpAt: expect.any(Date) });
    expect(followUp.state).toBe('COMPLETED');
    expect(activities.filter(({ type }) => type === 'FOLLOW_UP_COMPLETED')).toHaveLength(1);
    expect(transitions.map(({ fromStage, toStage }) => [fromStage, toStage])).toEqual([['FOLLOW_UP', 'CONTACTED']]);
  });
});
