import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: ['shared/vitest.config.ts', 'client/vitest.config.ts', 'server/vitest.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['shared/**/*.ts'],
      exclude: ['shared/**/*.test.ts', 'shared/test/**', 'shared/package.json'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 85 },
      reportsDirectory: './coverage',
    },
  },
});
