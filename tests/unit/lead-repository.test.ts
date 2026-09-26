import { afterAll, beforeEach, describe, expect, test } from 'vitest';

import { prisma } from '../../lib/db';
import { createActivity } from '../../lib/lead-repository';

describe('createActivity', () => {
  test('uses the isolated Supabase test schema', () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  beforeEach(async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('persists an activity associated with the supplied lead', async () => {
    const lead = await prisma.lead.create({ data: { osmId: 'osm-123' } });

    const activity = await createActivity({
      leadId: lead.id,
      actorId: 'user-123',
      channel: 'WHATSAPP',
      note: 'Primeiro contato'
    });

    expect(activity).toMatchObject({ channel: 'WHATSAPP', leadId: lead.id });
  });
});
