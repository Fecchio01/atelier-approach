import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'commercial-controls.component.spec.ts',
  workers: 1,
  use: { browserName: 'chromium' }
});
