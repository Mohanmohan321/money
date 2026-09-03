import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/db/integration.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
