import { beforeEach, describe, expect, test, vi } from 'vitest';

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

  test('requires both sale value and MRR before a lead can be marked as won', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'node/missing-closing-values' } });

    const response = await PATCH(
      new Request(`http://localhost/api/leads/${lead.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'WON', saleValue: 1200 })
      }),
      { params: Promise.resolve({ id: lead.id }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Informe o valor da venda e o MRR para fechar o negócio.' });
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
