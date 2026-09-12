import { defineConfig } from 'vitest/config';

const testDatabaseUrl = 'file:./test.db';

export default defineConfig({
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    fileParallelism: false,
    globalSetup: ['./tests/setup-test-database.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl
    }
  }
});
