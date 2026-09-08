import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8000';

// When STACK=native, Playwright boots the app itself via support/start-native.sh.
// When unset, the suite assumes something is already serving BASE_URL
// (a container started by scripts/, or a manually run uvicorn).
const useNativeWebServer = process.env.STACK === 'native';

export default defineConfig({
  testDir: './tests',
  outputDir: './.artifacts/results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { outputFolder: './.artifacts/report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1600, height: 1000 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useNativeWebServer
    ? {
        command: 'bash support/start-native.sh',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
