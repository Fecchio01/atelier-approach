import type { Prisma } from '@prisma/client';

import { prisma } from './db';

export function getCrmBoardLeads(database: Prisma.TransactionClient | typeof prisma = prisma) {
  return database.lead.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      website: true,
      instagram: true,
      whatsapp: true,
      address: true,
      category: true,
      osmId: true,
      latitude: true,
      longitude: true,
      stage: true,
      saleValue: true,
      mrr: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 1 }
    },
    orderBy: { id: 'desc' }
  });
}
