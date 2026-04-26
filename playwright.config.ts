import { defineConfig, devices } from '@playwright/test';

import { CONSTANTS } from './src/lib/constants';

const AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';
const IS_CI = !!process.env.CI;
const E2E_PORT = IS_CI ? '3000' : '3099';
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
const PLAYWRIGHT_REPORT_OUTPUT = process.env.PLAYWRIGHT_HTML_REPORT || 'e2e/playwright-report';
const PLAYWRIGHT_TEST_OUTPUT = process.env.PLAYWRIGHT_TEST_OUTPUT || 'e2e/test-results';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  timeout: IS_CI ? 45_000 : 30_000,
  expect: {
    timeout: 10_000,
  },
  globalTimeout: IS_CI ? 1_800_000 : undefined, // 30 minutes
  workers: 1,
  reporter: IS_CI
    ? [['blob', { outputDir: './blob-report' }], ['github']]
    : [['list'], ['html', { outputFolder: PLAYWRIGHT_REPORT_OUTPUT, open: 'never' }]],

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  outputDir: PLAYWRIGHT_TEST_OUTPUT,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: IS_CI
      ? 'node .next/standalone/server.js'
      : `rm -f .next/dev/lock && next dev --turbopack -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: IS_CI ? 60_000 : 120_000, // 1 min in CI (pre-built), 2 min locally
    env: {
      NODE_ENV: IS_CI ? 'production' : 'development',
      PORT: E2E_PORT,
      E2E_MODE: 'true',
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET,
      AUTH_URL: E2E_BASE_URL,
      NEXT_PUBLIC_BASE_URL: E2E_BASE_URL,
      NEXT_PUBLIC_E2E_MODE: 'true',
      NEXT_PUBLIC_CLOUDFLARE_SITE_KEY: '1x00000000000000000000AA',
      NEXT_PUBLIC_CLOUDFLARE_TEST_SITE_KEY: '1x00000000000000000000AA',
      CLOUDFLARE_SECRET: CONSTANTS.TURNSTILE.TEST_SECRET,
      SKIP_ENV_VALIDATION: 'true',
      NEXT_PUBLIC_BANNER_INTERVAL: '1000', // 1 second for faster E2E tests
    },
  },
});
