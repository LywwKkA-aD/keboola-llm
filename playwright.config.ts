import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/support/paths.ts';

/** End-to-end tests of the built app against a stub LLM; see e2e/global-setup.ts. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // One app server with one data dir: run specs one after another.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'ru-RU',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'e2e',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // Software WebGL, so the three.js aquarium renders headless.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
  ],
});
