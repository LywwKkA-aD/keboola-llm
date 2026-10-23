import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs', 'server/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['scripts/lib/**', 'server/src/**'],
      exclude: ['**/*.test.*', 'server/src/main.ts', 'server/src/cli/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
