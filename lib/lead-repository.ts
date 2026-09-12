import { Channel } from '@prisma/client';

import { prisma } from './db';

export type CreateActivityInput = {
  leadId: string;
  actorId: string;
  channel: Channel;
  note: string;
};

export async function createActivity(input: CreateActivityInput) {
  return prisma.activity.create({ data: input });
}
