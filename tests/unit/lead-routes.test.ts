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
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-07T10:00:00.000Z'));
      const lead = await prisma.lead.create({ data: { osmId: 'node/ui-controls', stage: 'INTEREST' } });
      await prisma.crmSettings.upsert({ where: { id: 'team' }, create: { id: 'team', followUpDelayDays: 3 }, update: { followUpDelayDays: 3 } });

      const followUpResponse = await PATCH(
        new Request(`http://localhost/api/leads/${lead.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ stage: 'FOLLOW_UP' })
        }),
        { params: Promise.resolve({ id: lead.id }) }
      );
      expect(followUpResponse.status).toBe(200);
      await expect(prisma.followUp.findMany({ where: { leadId: lead.id } })).resolves.toMatchObject([
        { ownerId: 'internal-equipe', dueDate: new Date('2026-09-10T10:00:00.000Z') }
      ]);

      const pendingFollowUp = await prisma.followUp.findFirstOrThrow({ where: { leadId: lead.id, state: 'PENDING' } });
      const repeatedResponse = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ stage: 'FOLLOW_UP' })
      }), { params: Promise.resolve({ id: lead.id }) });
      expect(repeatedResponse.status).toBe(200);
      await expect(prisma.followUp.findMany({ where: { leadId: lead.id } })).resolves.toHaveLength(1);
      await expect(prisma.followUp.findUniqueOrThrow({ where: { id: pendingFollowUp.id } })).resolves.toMatchObject({ state: 'PENDING' });

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
    } finally {
      vi.useRealTimers();
    }
  });

  test('uses the two-day fallback and replaces an existing pending follow-up only on a new transition', async () => {
    await prisma.crmSettings.deleteMany();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-10T10:00:00.000Z'));
      const lead = await prisma.lead.create({ data: { osmId: 'node/follow-up-fallback', stage: 'INTEREST' } });
      const oldFollowUp = await prisma.followUp.create({
        data: { leadId: lead.id, ownerId: 'internal-equipe', dueDate: new Date('2026-09-11T10:00:00.000Z'), note: 'Retorno antigo.' }
      });

      const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH', body: JSON.stringify({ stage: 'FOLLOW_UP' })
      }), { params: Promise.resolve({ id: lead.id }) });

      expect(response.status).toBe(200);
      await expect(prisma.followUp.findUniqueOrThrow({ where: { id: oldFollowUp.id } })).resolves.toMatchObject({
        state: 'CANCELLED', cancelledById: 'internal-equipe', cancelledAt: new Date('2026-09-10T10:00:00.000Z')
      });
      await expect(prisma.followUp.findMany({ where: { leadId: lead.id, state: 'PENDING' } })).resolves.toMatchObject([
        { dueDate: new Date('2026-09-12T10:00:00.000Z') }
      ]);
      await expect(prisma.followUp.count({ where: { leadId: lead.id } })).resolves.toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a changed company interval affects only follow-ups created after the change', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-10T10:00:00.000Z'));
      await prisma.crmSettings.upsert({ where: { id: 'team' }, create: { id: 'team', followUpDelayDays: 3 }, update: { followUpDelayDays: 3 } });
      const firstLead = await prisma.lead.create({ data: { osmId: 'node/follow-up-interval-first', stage: 'INTEREST' } });
      const firstResponse = await PATCH(new Request(`http://localhost/api/leads/${firstLead.id}`, {
        method: 'PATCH', body: JSON.stringify({ stage: 'FOLLOW_UP' })
      }), { params: Promise.resolve({ id: firstLead.id }) });
      expect(firstResponse.status).toBe(200);
      const firstFollowUp = await prisma.followUp.findFirstOrThrow({ where: { leadId: firstLead.id, state: 'PENDING' } });

      await prisma.crmSettings.update({ where: { id: 'team' }, data: { followUpDelayDays: 5 } });
      const secondLead = await prisma.lead.create({ data: { osmId: 'node/follow-up-interval-second', stage: 'INTEREST' } });
      const secondResponse = await PATCH(new Request(`http://localhost/api/leads/${secondLead.id}`, {
        method: 'PATCH', body: JSON.stringify({ stage: 'FOLLOW_UP' })
      }), { params: Promise.resolve({ id: secondLead.id }) });
      expect(secondResponse.status).toBe(200);

      await expect(prisma.followUp.findUniqueOrThrow({ where: { id: firstFollowUp.id } })).resolves.toMatchObject({
        state: 'PENDING', dueDate: new Date('2026-09-13T10:00:00.000Z')
      });
      await expect(prisma.followUp.findFirstOrThrow({ where: { leadId: secondLead.id, state: 'PENDING' } })).resolves.toMatchObject({
        dueDate: new Date('2026-09-15T10:00:00.000Z')
      });
    } finally {
      vi.useRealTimers();
    }
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

  test('closes with multiple services and preserves immutable sale snapshots', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/service-sale-snapshots' } });
    const setup = await Promise.all([
      prisma.serviceCatalogItem.create({ data: { name: 'Implantação', price: '1250.00', billingType: 'ONE_TIME' } }),
      prisma.serviceCatalogItem.create({ data: { name: 'Plano mensal', price: '299.90', billingType: 'MONTHLY' } }),
      prisma.serviceCatalogItem.create({ data: { name: 'Suporte mensal', price: '100.10', billingType: 'MONTHLY' } })
    ]);

    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceIds: setup.map((service) => service.id) })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(response.status).toBe(200);
    await prisma.serviceCatalogItem.update({ where: { id: setup[0].id }, data: { name: 'Implantação atualizada', price: '9999.00' } });
    const sale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id }, include: { lineItems: true } });
    expect(Number(sale.saleValue)).toBe(1650);
    expect(Number(sale.mrr)).toBe(400);
    expect(sale.lineItems).toHaveLength(3);
    expect(sale.lineItems.map(({ serviceName, price, billingType }) => ({ serviceName, price: Number(price), billingType }))).toEqual(expect.arrayContaining([
      { serviceName: 'Implantação', price: 1250, billingType: 'ONE_TIME' },
      { serviceName: 'Plano mensal', price: 299.9, billingType: 'MONTHLY' },
      { serviceName: 'Suporte mensal', price: 100.1, billingType: 'MONTHLY' }
    ]));
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'WON', saleValue: expect.anything(), mrr: expect.anything() });
  });

  test('uses optional per-sale service prices and snapshots them independently from catalog prices', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/service-sale-price-override' } });
    const [monthly, setup] = await Promise.all([
      prisma.serviceCatalogItem.create({ data: { name: 'Plano mensal', price: '199.90', billingType: 'MONTHLY' } }),
      prisma.serviceCatalogItem.create({ data: { name: 'Implantação', price: '1000.00', billingType: 'ONE_TIME' } })
    ]);

    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceItems: [
        { id: monthly.id, price: '149.90' },
        { id: setup.id, price: '850.25' }
      ] })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(response.status).toBe(200);
    const sale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id }, include: { lineItems: true } });
    expect(Number(sale.saleValue)).toBe(1000.15);
    expect(Number(sale.mrr)).toBe(149.9);
    expect(sale.lineItems.map(({ serviceId, serviceName, price, billingType }) => ({
      serviceId, serviceName, price: Number(price), billingType
    }))).toEqual(expect.arrayContaining([
      { serviceId: monthly.id, serviceName: 'Plano mensal', price: 149.9, billingType: 'MONTHLY' },
      { serviceId: setup.id, serviceName: 'Implantação', price: 850.25, billingType: 'ONE_TIME' }
    ]));
  });

  test('rejects invalid per-sale prices without moving the lead or recording revenue', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/invalid-service-sale-price' } });
    const service = await prisma.serviceCatalogItem.create({ data: { name: 'Serviço', price: '100', billingType: 'ONE_TIME' } });

    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceItems: [{ id: service.id, price: '12.345' }] })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(response.status).toBe(400);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'CONTACTED', saleValue: null, mrr: null });
    await expect(prisma.saleEvent.count({ where: { leadId: lead.id } })).resolves.toBe(0);
  });

  test.each([
    ['missing', 'missing-service-id'],
    ['archived', 'archived-service-id']
  ])('rejects %s service IDs atomically without creating a sale', async (kind, invalidId) => {
    const lead = await prisma.lead.create({ data: { osmId: `node/invalid-service-${kind}` } });
    const valid = await prisma.serviceCatalogItem.create({ data: { name: 'Serviço válido', price: '500', billingType: 'ONE_TIME' } });
    const archived = kind === 'archived'
      ? await prisma.serviceCatalogItem.create({ data: { name: 'Serviço arquivado', price: '100', billingType: 'MONTHLY', isActive: false } })
      : null;
    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceIds: [valid.id, archived?.id ?? invalidId] })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(response.status).toBe(400);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'CONTACTED', saleValue: null, mrr: null });
    await expect(prisma.saleEvent.count({ where: { leadId: lead.id } })).resolves.toBe(0);
    await expect(prisma.stageHistory.count({ where: { leadId: lead.id } })).resolves.toBe(0);
    await expect(prisma.activity.count({ where: { leadId: lead.id } })).resolves.toBe(0);
  });

  test('keeps closing without selected services compatible at zero values', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/no-service-selection' } });
    const response = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceIds: [] })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(response.status).toBe(200);
    const sale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id }, include: { lineItems: true } });
    expect(Number(sale.saleValue)).toBe(0);
    expect(Number(sale.mrr)).toBe(0);
    expect(sale.lineItems).toHaveLength(0);
  });

  test('reopening marks the active sale reversed and audits the actor without deleting snapshots', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/audited-sale-reversal' } });
    const service = await prisma.serviceCatalogItem.create({ data: { name: 'Plano preservado', price: '89.90', billingType: 'MONTHLY' } });
    const close = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'WON', serviceIds: [service.id] })
    }), { params: Promise.resolve({ id: lead.id }) });
    expect(close.status).toBe(200);
    const originalSale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id }, include: { lineItems: true } });

    const reopen = await PATCH(new Request(`http://localhost/api/leads/${lead.id}`, {
      method: 'PATCH', body: JSON.stringify({ stage: 'CONTACTED' })
    }), { params: Promise.resolve({ id: lead.id }) });

    expect(reopen.status).toBe(200);
    await expect(prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).resolves.toMatchObject({ stage: 'CONTACTED', saleValue: null, mrr: null, wonAt: null, wonById: null });
    const reversedSale = await prisma.saleEvent.findUniqueOrThrow({ where: { id: originalSale.id }, include: { lineItems: true } });
    expect(reversedSale.reversedAt).toEqual(expect.any(Date));
    expect(reversedSale.reversedById).toBe('internal-equipe');
    expect(reversedSale.lineItems).toMatchObject([{ serviceId: service.id, serviceName: 'Plano preservado', price: expect.anything(), billingType: 'MONTHLY' }]);
    await expect(prisma.activity.findFirstOrThrow({ where: { leadId: lead.id, type: 'SALE_REVERSED' } })).resolves.toMatchObject({ actorId: 'internal-equipe', note: expect.stringContaining('Negócio reaberto') });
    await expect(prisma.saleEvent.count({ where: { leadId: lead.id } })).resolves.toBe(1);
  });

  test('reclosing after reversal creates a distinct active sale event', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/reclosed-sale-events' } });
    const service = await prisma.serviceCatalogItem.create({ data: { name: 'Serviço recontratado', price: '250', billingType: 'ONE_TIME' } });
    const patch = (body: object) => PATCH(new Request(`http://localhost/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: lead.id }) });
    expect((await patch({ stage: 'WON', serviceIds: [service.id] })).status).toBe(200);
    const first = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: lead.id } });
    expect((await patch({ stage: 'CONTACTED' })).status).toBe(200);
    expect((await patch({ stage: 'WON', serviceIds: [service.id] })).status).toBe(200);
    const sales = await prisma.saleEvent.findMany({ where: { leadId: lead.id } });
    expect(sales).toHaveLength(2);
    expect(sales.find((sale) => sale.id === first.id)).toMatchObject({ reversedAt: expect.any(Date), reversedById: 'internal-equipe' });
    const active = sales.find((sale) => sale.id !== first.id);
    expect(active).toMatchObject({ reversedAt: null, saleValue: expect.anything() });
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
  type TestSale = { id: string; leadId: string; actorId: string; saleValue: number; mrr: number; occurredAt: Date; reversedAt: Date | null; reversedById: string | null };
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
        create: async ({ data }: { data: Omit<TestSale, 'id' | 'reversedAt' | 'reversedById'> }) => { const sale = { id: `sale-${sales.length + 1}`, reversedAt: null, reversedById: null, ...data }; sales.push(sale); return sale; },
        findFirst: async () => sales.filter((sale) => sale.reversedAt === null).toSorted((a, b) => b.occurredAt.valueOf() - a.occurredAt.valueOf())[0] ?? null,
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
      expect(sales).toEqual([
        { ...original, reversedAt: new Date('2026-09-01T12:00:00Z'), reversedById: 'internal-equipe' },
        { ...current, saleValue: 400 }
      ]);
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
