import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': path.dirname(fileURLToPath(import.meta.url)) }
  },
  test: {
    include: ['tests/unit/motion-primitives.test.tsx', 'tests/unit/commercial-modal.test.tsx', 'tests/unit/metrics-query-concurrency.test.ts', 'tests/unit/reports-query-concurrency.test.ts', 'tests/unit/crm-board-query.test.ts'],
    fileParallelism: false
  }
});
