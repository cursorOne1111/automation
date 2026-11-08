import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const port = Number(process.env.DEMO_PORT ?? 3100);
const demoURL = `http://127.0.0.1:${port}`;
const webURL = process.env.BASE_URL ?? demoURL;
const apiURL = process.env.API_BASE_URL ?? webURL;
const useDemo = webURL === demoURL || apiURL === demoURL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: webURL, trace: 'retain-on-failure',
    screenshot: 'only-on-failure', video: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testMatch: /api\/.*\.spec\.ts/, use: { baseURL: apiURL } },
    { name: 'chromium', testMatch: /ui\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useDemo ? {
    command: 'node demo/server.mjs', url: `${demoURL}/health`,
    reuseExistingServer: false, timeout: 15_000,
    env: { DEMO_PORT: String(port) },
  } : undefined,
});
