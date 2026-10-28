import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  // Every test starts its own server, browser context and Git processes; more workers than this
  // oversubscribes a laptop and turns waits into false failures.
  workers: 3,
  expect: { timeout: 15_000 },
  // Pull-request flows build real repositories and fetch them; 30 s is too tight for them.
  timeout: 60_000,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'perf/**',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Timing budgets: runs alone, after the main suite has finished.
      name: 'performance',
      testMatch: 'perf/**/*.spec.ts',
      dependencies: ['chromium'],
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
