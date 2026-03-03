import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
    include: ['tests/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.mjs', 'core.mjs'],
      exclude: ['src/workers/render-worker.mjs'],
      reporter: ['text', 'json-summary'],
    },
  },
});
