import { defineConfig } from '@playwright/test';

import { e2eCredentials } from './tests/e2e/credentials';

const e2eBaseUrl = 'http://127.0.0.1:3001';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL: e2eBaseUrl
  },
  webServer: {
    command: 'next dev -p 3001',
    url: e2eBaseUrl,
    reuseExistingServer: false,
    env: {
      ...process.env,
      AUTH_INTERNAL_EMAIL: e2eCredentials.email,
      AUTH_INTERNAL_PASSWORD: e2eCredentials.password,
      AUTH_INTERNAL_SECONDARY_EMAIL: e2eCredentials.secondary.email,
      AUTH_INTERNAL_SECONDARY_PASSWORD: e2eCredentials.secondary.password
    }
  }
});
