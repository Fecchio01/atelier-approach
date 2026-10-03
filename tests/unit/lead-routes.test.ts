import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { DELETE, PATCH } from '../../app/api/leads/[id]/route';
import { POST } from '../../app/api/leads/route';
import { prisma } from '../../lib/db';

describe('lead routes', () => {
  beforeEach(async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'internal-equipe' });
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
  });

  test('creates a shared lead and records the first approach', async () => {
    const response = await POST(
      new Request('http://localhost/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          business: { osmId: 'node/auto-brilho', name: 'Auto Brilho', phone: null, website: null, instagram: null },
          channel: 'WHATSAPP',
          note: 'Primeiro contato no WhatsApp'
        })
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.lead).toMatchObject({ osmId: 'node/auto-brilho', name: 'Auto Brilho', stage: 'CONTACTED' });
    await expect(prisma.activity.findMany({ where: { leadId: payload.lead.id } })).resolves.toHaveLength(1);
  });

  test('defaults database creations to CONTACTED', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/default-stage' } });
    expect(lead.stage).toBe('CONTACTED');
  });

  test('rejects NEW as a destination without changing persisted legacy data', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/legacy-new', stage: 'NEW' } });
    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'NEW' })
    }), { params: Promise.resolve({ id: lead.id }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Etapa inválida.' });
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'NEW' });
    expect(await prisma.stageHistory.count({ where: { leadId: lead.id } })).toBe(0);
  });

  test('allows contact updates and operational transitions on persisted NEW leads', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/legacy-update', stage: 'NEW' } });
    const contactResponse = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ activity: { channel: 'PHONE', note: 'Contato legado.' } })
    }), { params: Promise.resolve({ id: lead.id }) });
    expect(contactResponse.status).toBe(200);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'NEW' });
    const moveResponse = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'MEETING' })
    }), { params: Promise.resolve({ id: lead.id }) });
    expect(moveResponse.status).toBe(200);
    await expect(prisma.stageHistory.findFirstOrThrow({ where: { leadId: lead.id } })).resolves.toMatchObject({ fromStage: 'NEW', toStage: 'MEETING' });
  });

  test('records a default approach note when the user submits only a channel', async () => {
    const response = await POST(new Request('http://localhost/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        business: { osmId: 'node/no-note-required', name: 'Oficina Sem Nota' },
        channel: 'WHATSAPP'
      })
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    await expect(prisma.activity.findFirstOrThrow({ where: { leadId: payload.lead.id } })).resolves.toMatchObject({
      channel: 'WHATSAPP', note: 'Abordagem iniciada a partir da pesquisa.'
    });
  });

  test('deletes a test approach and all of its CRM history so it can return to research', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/restore-to-research' } });
    await prisma.activity.create({ data: { leadId: lead.id, actorId: 'internal-equipe', note: 'Abordagem de teste.' } });
    await prisma.followUp.create({ data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date('2026-09-20T12:00:00.000Z'), note: 'Teste.' } });
    await prisma.stageHistory.create({ data: { leadId: lead.id, actorId: 'internal-equipe', toStage: 'CONTACTED' } });
    await prisma.saleEvent.create({ data: { leadId: lead.id, actorId: 'internal-equipe', saleValue: 1, mrr: 1 } });

    const response = await DELETE(
      new Request(`http://localhost/api/leads/${lead.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    await expect(prisma.lead.findUnique({ where: { id: lead.id } })).resolves.toBeNull();
    await expect(prisma.activity.count({ where: { leadId: lead.id } })).resolves.toBe(0);
    await expect(prisma.followUp.count({ where: { leadId: lead.id } })).resolves.toBe(0);
    await expect(prisma.stageHistory.count({ where: { leadId: lead.id } })).resolves.toBe(0);
    await expect(prisma.saleEvent.count({ where: { leadId: lead.id } })).resolves.toBe(0);
  });

  test('returns 404 when restoring a lead that is not in the CRM', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/leads/missing-lead', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'missing-lead' }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Lead não encontrado.' });
  });

  test('rejects a duplicate OSM record with a link to its existing CRM record', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/duplicate' } });

    const response = await POST(
      new Request('http://localhost/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          business: { osmId: 'node/duplicate', name: 'Duplicado' },
          channel: 'PHONE',
          note: 'Contato'
        })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Esta empresa já está no CRM.',
      leadId: lead.id,
      href: `/crm?lead=${lead.id}`
    });
  });

  test('rejects negative monetary values when moving a lead', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/value' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: -1, mrr: 0 })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Valores monetários devem ser não negativos.' });
  });

  test('records the timestamp and actor when a lead is moved to WON', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/win-event', stage: 'INTEREST' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: 1200, mrr: 300 })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(200);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({
      stage: 'WON', wonById: 'internal-equipe', wonAt: expect.any(Date)
    });
  });

  test('schedules a follow-up and persists closing values supplied by the CRM', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/ui-controls', stage: 'INTEREST' } });

    const followUpResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'FOLLOW_UP', followUpAt: '2026-09-10T10:00:00.000Z' })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );
    expect(followUpResponse.status).toBe(200);
    await expect(prisma.followUp.findMany({ where: { leadId: lead.id } })).resolves.toMatchObject([
      { ownerId: 'internal-equipe', dueDate: new Date('2026-09-10T10:00:00.000Z') }
    ]);

    const closeResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: 1500, mrr: 250 })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );
    expect(closeResponse.status).toBe(200);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({
      stage: 'WON', saleValue: expect.anything(), mrr: expect.anything()
    });
  });

  test('rejects malformed monetary values when moving a lead', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/malformed-value' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: '100', mrr: {} })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Valores monetários devem ser não negativos.' });
  });

  test('records an unpriced win and cancels pending follow-ups', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/missing-closing-values' } });
    const followUp = await prisma.followUp.create({ data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date(), note: 'Retorno pendente.' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON' })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(200);
    const sale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(Number(sale.saleValue)).toBe(0);
    expect(Number(sale.mrr)).toBe(0);
    expect(await prisma.saleEvent.count({ where: { leadId: lead.id } })).toBe(1);
    await expect(prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } })).resolves.toMatchObject({ state: 'CANCELLED', cancelledById: 'internal-equipe' });
  });

  test('supplements a persisted sale without changing its identity or counting another sale', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/financial-complement' } });
    expect((await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ stage: 'WON' }) }), { params: Promise.resolve({ id: lead.id }) })).status).toBe(200);
    const original = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect((await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify({ saleValue: 1500 }) }), { params: Promise.resolve({ id: lead.id }) })).status).toBe(200);
    const sales = await prisma.saleEvent.findMany({ where: { leadId: lead.id } });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ id: original.id, occurredAt: original.occurredAt, actorId: original.actorId });
    expect(Number(sales[0].saleValue)).toBe(1500);
    expect(Number(sales[0].mrr)).toBe(0);
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(Number(updated.saleValue)).toBe(1500);
    expect(Number(updated.mrr)).toBe(0);
    await expect(prisma.activity.findFirstOrThrow({ where: { leadId: lead.id, type: 'SALE_FINANCIALS_UPDATED' } })).resolves.toMatchObject({ actorId: 'internal-equipe', note: 'Valores da venda atualizados: venda de 0 para 1500; MRR de 0 para 0.' });
  });

  test('discards a lead directly without requiring a written reason', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/direct-discard' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ stage: 'DISCARDED' })
      }), { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(200);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'DISCARDED' });
    await expect(prisma.activity.findFirstOrThrow({ where: { leadId: lead.id, type: 'DISCARDED' } })).resolves.toMatchObject({ note: 'Lead descartado.' });
  });

  test('records structured stage and immutable sale histories, then clears the active sale on reopen', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/reopen-history', stage: 'INTEREST' } });

    const wonResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: 1200, mrr: 300 })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );
    expect(wonResponse.status).toBe(200);

    const reopenedResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'INTEREST' })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );
    expect(reopenedResponse.status).toBe(200);

    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({
      stage: 'INTEREST', saleValue: null, mrr: null, wonAt: null, wonById: null
    });
    await expect(prisma.stageHistory.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' } })).resolves.toMatchObject([
      { fromStage: 'INTEREST', toStage: 'WON', actorId: 'internal-equipe' },
      { fromStage: 'WON', toStage: 'INTEREST', actorId: 'internal-equipe' }
    ]);
    await expect(prisma.saleEvent.findMany({ where: { leadId: lead.id } })).resolves.toMatchObject([
      { saleValue: expect.anything(), mrr: expect.anything(), actorId: 'internal-equipe' }
    ]);
  });

  test('completes, cancels, and reschedules follow-ups while preserving their history', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/follow-up-lifecycle' } });
    const first = await prisma.followUp.create({
      data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date('2026-09-15T10:00:00.000Z'), note: 'Ligar.' }
    });

    const completeResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ followUpAction: 'COMPLETE', followUpId: first.id })
      }), { params: Promise.resolve({ id: lead.id }) }
    );
    expect(completeResponse.status).toBe(200);
    await expect(prisma.followUp.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({
      state: 'COMPLETED', completedById: 'internal-equipe', completedAt: expect.any(Date)
    });

    const second = await prisma.followUp.create({
      data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date('2026-09-16T10:00:00.000Z'), note: 'Enviar proposta.' }
    });
    const rescheduleResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ followUpAction: 'RESCHEDULE', followUpId: second.id, followUpAt: '2026-09-17T10:00:00.000Z' })
      }), { params: Promise.resolve({ id: lead.id }) }
    );
    expect(rescheduleResponse.status).toBe(200);
    await expect(prisma.followUp.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({ state: 'CANCELLED', cancelledById: 'internal-equipe' });
    await expect(prisma.followUp.findMany({ where: { leadId: lead.id, state: 'PENDING' } })).resolves.toMatchObject([
      { dueDate: new Date('2026-09-17T10:00:00.000Z') }
    ]);

    const third = await prisma.followUp.create({
      data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date('2026-09-18T10:00:00.000Z'), note: 'Confirmar proposta.' }
    });
    const cancelResponse = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ followUpAction: 'CANCEL', followUpId: third.id })
      }), { params: Promise.resolve({ id: lead.id }) }
    );
    expect(cancelResponse.status).toBe(200);
    await expect(prisma.followUp.findUniqueOrThrow({ where: { id: third.id } })).resolves.toMatchObject({
      state: 'CANCELLED', cancelledById: 'internal-equipe', cancelledAt: expect.any(Date)
    });
  });
});

// The real database contract above remains enabled. This route-level harness also
// exercises financial transactions without requiring a migrated PostgreSQL enum.
describe('sale financial contract without database', () => {
  type TestLead = { id: string; stage: string; saleValue: number | null; mrr: number | null; wonAt: Date | null; wonById: string | null };
  type TestSale = { id: string; leadId: string; actorId: string; saleValue: number; mrr: number; occurredAt: Date };
  let lead: TestLead;
  let sales: TestSale[];
  let activities: { type: string; note: string }[];
  let followUps: { state: string; cancelledById?: string }[];

  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'internal-equipe' });
    lead = { id: 'financial-lead', stage: 'CONTACTED', saleValue: null, mrr: null, wonAt: null, wonById: null };
    sales = [];
    activities = [];
    followUps = [{ state: 'PENDING' }, { state: 'COMPLETED' }];
    const tx = {
      $queryRaw: async () => [{ id: lead.id }],
      lead: { findUnique: async () => ({ ...lead }), update: async ({ data }: { data: Partial<TestLead> }) => (lead = { ...lead, ...data }) },
      stageHistory: { create: async () => ({}) },
      saleEvent: {
        create: async ({ data }: { data: Omit<TestSale, 'id'> }) => { const sale = { id: `sale-${sales.length + 1}`, ...data }; sales.push(sale); return sale; },
        findFirst: async () => sales.toSorted((a, b) => b.occurredAt.valueOf() - a.occurredAt.valueOf())[0] ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Partial<TestSale> }) => { const sale = sales.find((item) => item.id === where.id)!; Object.assign(sale, data); return sale; }
      },
      activity: { create: async ({ data }: { data: { type: string; note: string } }) => { activities.push(data); return data; } },
      followUp: { updateMany: async ({ data }: { data: { state: string; cancelledById: string } }) => { followUps.filter((item) => item.state === 'PENDING').forEach((item) => Object.assign(item, data)); return { count: 1 }; } }
    };
    vi.spyOn(prisma, '$transaction').mockImplementation((async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  async function patch(data: Record<string, unknown>) {
    return PATCH(new Request('http://localhost/api/leads/financial-lead', { method: 'PATCH', body: JSON.stringify(data) }), { params: Promise.resolve({ id: lead.id }) });
  }

  test('wins without a price, counts one sale, and cancels only pending follow-ups', async () => {
    expect((await patch({ stage: 'WON' })).status).toBe(200);
    expect(lead).toMatchObject({ stage: 'WON', saleValue: 0, mrr: 0, wonById: 'internal-equipe' });
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ saleValue: 0, mrr: 0 });
    expect(followUps).toEqual([expect.objectContaining({ state: 'CANCELLED', cancelledById: 'internal-equipe' }), { state: 'COMPLETED' }]);
  });

  test('supplements only supplied financial values while preserving sale identity and date', async () => {
    expect((await patch({ stage: 'WON', mrr: 30 })).status).toBe(200);
    const original = { ...sales[0] };
    expect((await patch({ saleValue: 500 })).status).toBe(200);
    expect(sales).toEqual([{ ...original, saleValue: 500 }]);
    expect(lead).toMatchObject({ saleValue: 500, mrr: 30 });
    expect(activities.filter((item) => item.type === 'SALE_FINANCIALS_UPDATED')).toHaveLength(1);
    expect(activities.at(-1)?.note).toBe('Valores da venda atualizados: venda de 0 para 500; MRR de 30 para 30.');
    expect((await patch({ mrr: 70 })).status).toBe(200);
    expect(sales).toEqual([{ ...original, saleValue: 500, mrr: 70 }]);
  });

  test('backfills a legacy won lead with its original winning actor and date only once', async () => {
    const wonAt = new Date('2026-09-01T12:00:00Z');
    lead = { ...lead, stage: 'WON', wonAt, wonById: 'original-actor', saleValue: 200, mrr: 20 };
    expect((await patch({ mrr: 50 })).status).toBe(200);
    expect(sales).toEqual([expect.objectContaining({ actorId: 'original-actor', occurredAt: wonAt, saleValue: 200, mrr: 50 })]);
    expect((await patch({ saleValue: 300 })).status).toBe(200);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ actorId: 'original-actor', occurredAt: wonAt, saleValue: 300, mrr: 50 });
  });

  test('preserves the previous win when reopening and supplements the current sale', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      expect((await patch({ stage: 'WON', saleValue: 100, mrr: 10 })).status).toBe(200);
      const original = { ...sales[0] };
      expect((await patch({ stage: 'CONTACTED' })).status).toBe(200);
      vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
      expect((await patch({ stage: 'WON' })).status).toBe(200);
      const current = { ...sales[1] };
      expect((await patch({ saleValue: 400 })).status).toBe(200);
      expect(sales).toEqual([original, { ...current, saleValue: 400 }]);
    } finally { vi.useRealTimers(); }
  });

  test.each([-1, '100', null, {}, true])('rejects malformed/negative finances %j before changing a sale', async (value) => {
    expect((await patch({ stage: 'WON', saleValue: value })).status).toBe(400);
    expect(sales).toHaveLength(0);
    expect(lead.stage).toBe('CONTACTED');
  });

  test('rejects financial updates on a lead that is not won', async () => {
    expect((await patch({ saleValue: 100 })).status).toBe(400);
    expect(sales).toHaveLength(0);
  });

  test('does not duplicate a sale when a won request is repeated', async () => {
    expect((await patch({ stage: 'WON' })).status).toBe(200);
    expect((await patch({ stage: 'WON' })).status).toBe(409);
    expect(sales).toHaveLength(1);
    expect(activities.filter((item) => item.type === 'SALE_WON')).toHaveLength(1);
  });

  test('rejects a non-finite JSON number before writing financial records', async () => {
    const response = await PATCH(new Request('http://localhost/api/leads/financial-lead', { method: 'PATCH', body: '{"stage":"WON","saleValue":1e400}' }), { params: Promise.resolve({ id: lead.id }) });
    expect(response.status).toBe(400);
    expect(sales).toHaveLength(0);
  });
});
