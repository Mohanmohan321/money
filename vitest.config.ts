import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./client/test/setup.ts'],
    exclude: ['e2e/**', 'server/db/integration.test.ts', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    restoreMocks: true,
  },
});
