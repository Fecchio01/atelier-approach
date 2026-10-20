import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'research-approach-position.component.spec.ts',
  workers: 1,
  timeout: 20_000
});
