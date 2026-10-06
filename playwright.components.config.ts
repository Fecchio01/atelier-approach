import { defineConfig } from '@playwright/test';

// Bounded client-component verification, with no Next server or authentication compile.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'commercial-controls.component.spec.ts',
  workers: 1,
  timeout: 20_000
});
