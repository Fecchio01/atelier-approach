import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

import { e2eCredentials } from './tests/e2e/credentials';

loadEnvConfig(process.cwd());

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

const e2ePort = Number(process.env.IOS_FUNNEL_E2E_PORT ?? '3018');
const baseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'ios-funnel-scroll.spec.ts',
  globalSetup: undefined,
  workers: 1,
  projects: [{ name: 'webkit', use: { ...devices['iPhone 13'] } }],
  use: { baseURL: baseUrl },
  webServer: {
    command: `npm run dev -- -p ${e2ePort}`,
    url: `${baseUrl}/login`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      NEXT_DIST_DIR: '.next-ios-funnel-scroll',
      AUTH_INTERNAL_EMAIL: e2eCredentials.email,
      AUTH_INTERNAL_PASSWORD: e2eCredentials.password,
      AUTH_INTERNAL_SECONDARY_EMAIL: e2eCredentials.secondary.email,
      AUTH_INTERNAL_SECONDARY_PASSWORD: e2eCredentials.secondary.password
    }
  }
});
