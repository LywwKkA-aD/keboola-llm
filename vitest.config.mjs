import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['scripts/**/*.test.mjs', 'server/src/**/*.test.ts'], environment: 'node' } },
      {
        plugins: [react()],
        test: {
          name: 'web',
          include: ['web/src/**/*.test.{ts,tsx}'],
          environment: 'happy-dom',
          setupFiles: ['web/src/test-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['scripts/lib/**', 'server/src/**', 'web/src/**'],
      exclude: [
        '**/*.test.*',
        'server/src/main.ts',
        'server/src/cli/**',
        'web/src/main.tsx',
        'web/src/test-setup.ts',
        // WebGL-only rendering: needs a GPU context, verified with scripts/shoot.mjs screenshots. Its logic lives in tested modules.
        'web/src/aquarium3d/scene/**',
        'web/src/preview/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
