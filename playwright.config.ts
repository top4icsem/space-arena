import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:5173',
    timeout: 45_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: '3000' },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
