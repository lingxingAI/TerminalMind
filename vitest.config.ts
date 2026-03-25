import { defineConfig } from 'vitest/config';

export default defineConfig({
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
