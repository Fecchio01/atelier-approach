import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workflow } from '@workflow/vitest';
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'vitest/config';

loadEnvConfig(process.cwd());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

export default defineConfig({
  plugins: [workflow()],
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.dirname(fileURLToPath(import.meta.url)) } },
  test: {
    include: ['workflows/**/*.integration.test.ts'],
    exclude: ['node_modules/**', '**/.next*/**', '**/.worktrees/**'],
    globalSetup: ['./tests/setup-test-database.ts'],
    testTimeout: 60_000,
    fileParallelism: false,
    env: { DATABASE_URL: testDatabaseUrl }
  }
});
