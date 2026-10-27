import type { Prisma, PrismaClient } from '@prisma/client';

import type { CrmActor } from './actor';

export type CrmCommandExecutor = Pick<PrismaClient, '$transaction'>;
export type CrmCommandHandler<T> = (transaction: Prisma.TransactionClient, actor: CrmActor) => Promise<T>;

export function executeCrmCommand<T>(
  database: CrmCommandExecutor,
  actor: CrmActor,
  handler: CrmCommandHandler<T>
): Promise<T> {
  return database.$transaction((transaction) => handler(transaction, actor));
}

export function withCrmActivityActor<T extends Record<string, unknown>>(
  actor: CrmActor,
  activity: T
): T & { actorId: string; origin: CrmActor['origin'] } {
  return { ...activity, actorId: actor.id, origin: actor.origin };
}
