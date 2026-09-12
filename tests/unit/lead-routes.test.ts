import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));

import { PATCH } from '../../app/api/leads/[id]/route';
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
      error: 'Este prospect já está no CRM.',
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
});
