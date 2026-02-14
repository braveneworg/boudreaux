import { defineConfig, devices } from '@playwright/test';

const AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?directConnection=true';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { outputFolder: 'e2e/playwright-report' }], ['github']]
    : [['html', { outputFolder: 'e2e/playwright-report', open: 'never' }]],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  outputDir: 'e2e/test-results',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      E2E_MODE: 'true',
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET,
      AUTH_URL: 'http://localhost:3000',
      NEXT_PUBLIC_CLOUDFLARE_SITE_KEY: '1x00000000000000000000AA',
      NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY: '1x00000000000000000000AA',
      CLOUDFLARE_SECRET: '1x0000000000000000000000000000000AA',
      SKIP_ENV_VALIDATION: 'true',
    },
  },
});
