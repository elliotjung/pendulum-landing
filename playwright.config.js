import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: 0,
  snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  webServer: {
    command: 'node scripts/static-server.mjs 4177',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ]
});
