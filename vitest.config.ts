import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@terminalmind/services': path.resolve(root, 'packages/services/src/index.ts'),
      '@terminalmind/api': path.resolve(root, 'packages/api/src/index.ts'),
      '@terminalmind/core': path.resolve(root, 'packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/core/src/**/*.test.ts',
      'packages/services/src/**/*.test.ts',
      'extensions/*/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/services/src/**'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    },
  },
});
