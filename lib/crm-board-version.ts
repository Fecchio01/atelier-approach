import type { Prisma } from '@prisma/client';

import { prisma } from './db';

export async function getCrmBoardVersion(database: Prisma.TransactionClient | typeof prisma = prisma) {
  const [leads, history, activities] = await Promise.all([
    database.lead.aggregate({ _count: { _all: true } }),
    database.stageHistory.aggregate({ _count: { _all: true }, _max: { createdAt: true } }),
    database.activity.aggregate({ _count: { _all: true }, _max: { createdAt: true } })
  ]);

  return `${leads._count._all}:${history._count._all}:${history._max.createdAt?.toISOString() ?? 'empty'}:${activities._count._all}:${activities._max.createdAt?.toISOString() ?? 'empty'}`;
}
