import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Extension-internal alias (WXT maps "@" to apps/extension).
      '@/src': resolve(import.meta.dirname, 'apps/extension/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/extension/src/**/*.test.ts'],
  },
});
