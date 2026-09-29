import { PrismaClient } from '@prisma/client';

export default async function setupTestDatabase() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }

  process.env.DATABASE_URL = testDatabaseUrl;
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

  try {
    await prisma.dailyReport.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.goal.deleteMany();
    await prisma.memberProfile.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}
