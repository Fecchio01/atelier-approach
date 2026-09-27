import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

loadEnvConfig(process.cwd());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

export default defineConfig({
  resolve: {
    alias: { '@': path.dirname(fileURLToPath(import.meta.url)) }
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    fileParallelism: false,
    globalSetup: ['./tests/setup-test-database.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl
    }
  }
});
