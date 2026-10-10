import { loadEnvConfig } from '@next/env';
import { defineConfig } from '@playwright/test';

import { e2eCredentials } from './tests/e2e/credentials';

loadEnvConfig(process.cwd());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

const e2ePort = Number(process.env.CRM_LIFECYCLE_E2E_PORT ?? '3017');
const baseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'crm-lifecycle-automation.spec.ts',
  globalSetup: undefined,
  workers: 1,
  use: { baseURL: baseUrl },
  webServer: {
    command: `npm run dev -- -p ${e2ePort}`,
    url: `${baseUrl}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      NEXT_DIST_DIR: '.next-e2e-crm-lifecycle',
      AUTH_INTERNAL_EMAIL: e2eCredentials.email,
      AUTH_INTERNAL_PASSWORD: e2eCredentials.password,
      AUTH_INTERNAL_SECONDARY_EMAIL: e2eCredentials.secondary.email,
      AUTH_INTERNAL_SECONDARY_PASSWORD: e2eCredentials.secondary.password,
      CRON_SECRET: 'crm-lifecycle-e2e-cron-secret'
    }
  }
});
