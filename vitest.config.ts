import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.dirname(fileURLToPath(import.meta.url)) }
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**', '.superpowers/**'],
    fileParallelism: false,
    globalSetup: ['./tests/setup-test-database.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl
    }
  }
});
