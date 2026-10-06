import { loadEnvConfig } from '@next/env';
import { defineConfig } from '@playwright/test';

import { e2eCredentials } from './tests/e2e/credentials';

loadEnvConfig(process.cwd());
const e2ePort = Number(process.env.E2E_PORT ?? '3001');
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/setup-test-database.ts',
  workers: 1,
  use: {
    baseURL: e2eBaseUrl
  },
  webServer: {
    command: `npm run dev -- -p ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_DIST_DIR: '.next-e2e',
      DATABASE_URL: testDatabaseUrl,
      AUTH_INTERNAL_EMAIL: e2eCredentials.email,
      AUTH_INTERNAL_PASSWORD: e2eCredentials.password,
      AUTH_INTERNAL_SECONDARY_EMAIL: e2eCredentials.secondary.email,
      AUTH_INTERNAL_SECONDARY_PASSWORD: e2eCredentials.secondary.password
    }
  }
});
