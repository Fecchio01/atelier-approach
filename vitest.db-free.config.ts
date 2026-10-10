import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.dirname(fileURLToPath(import.meta.url)) } },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**', '.superpowers/**'],
    fileParallelism: false
  }
});
