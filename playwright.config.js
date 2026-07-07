import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  webServer: {
    command: 'python -m http.server 4177 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: true,
    timeout: 30_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4177'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ]
});
