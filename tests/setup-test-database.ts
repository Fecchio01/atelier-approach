import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const testDatabaseUrl = 'file:./test.db';
const testDatabasePath = fileURLToPath(new URL('../prisma/test.db', import.meta.url));
const migrationPath = fileURLToPath(
  new URL('../prisma/migrations/20260911220200_initial/migration.sql', import.meta.url)
);
const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
const prismaCliPath = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));

export default function setupTestDatabase() {
  rmSync(testDatabasePath, { force: true });

  execFileSync(process.execPath, [
    prismaCliPath,
    'db',
    'execute',
    '--file',
    migrationPath,
    '--schema',
    schemaPath
  ], {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit'
  });

  return () => rmSync(testDatabasePath, { force: true });
}
