import { prisma } from './db';
import { processLeadLifecycle, type LifecycleDatabase } from './process-lead-lifecycle';

export function processCrmLifecycleForPageRequest(
  database: LifecycleDatabase = prisma as unknown as LifecycleDatabase,
  now = new Date()
) {
  return processLeadLifecycle(database, now);
}
