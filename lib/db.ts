import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getRuntimeDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) return undefined;

  const url = new URL(configuredUrl);

  // Supabase's shared session pooler has a hard client limit. Vercel functions
  // are short-lived and scale horizontally, so route pooled Supabase URLs
  // through transaction mode and keep Prisma's per-instance pool small.
  if (url.hostname.endsWith('.pooler.supabase.com')) {
    if (url.port === '5432') url.port = '6543';
    url.searchParams.set('pgbouncer', 'true');
  }
  url.searchParams.set('connection_limit', '1');

  return url.toString();
}

const runtimeDatabaseUrl = getRuntimeDatabaseUrl();
export const prisma = globalForPrisma.prisma ?? new PrismaClient(
  runtimeDatabaseUrl ? { datasources: { db: { url: runtimeDatabaseUrl } } } : undefined
);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
