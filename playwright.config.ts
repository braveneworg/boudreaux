import { defineConfig, devices } from '@playwright/test';

import { CONSTANTS } from './src/lib/constants';

const AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

/**
 * Hard guard: E2E must NEVER connect to anything but the local Docker
 * MongoDB on port 27018. We refuse to start if E2E_DATABASE_URL has been
 * pointed elsewhere. We also refuse if a non-local DATABASE_URL is present
 * in the parent process env, because Next.js / Prisma can pick that up
 * and bypass the webServer.env override.
 */
function assertLocalE2EDatabase(): void {
  const isLocal = (raw: string | undefined): boolean => {
    if (!raw) return false;
    try {
      const u = new URL(raw);
      return (
        u.protocol === 'mongodb:' &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        u.port === '27018'
      );
    } catch {
      return false;
    }
  };

  if (!isLocal(E2E_DATABASE_URL)) {
    throw new Error(
      'E2E refused to start: E2E_DATABASE_URL must point to ' +
        'mongodb://localhost:27018/... (the local Docker container). ' +
        'Never set E2E_DATABASE_URL from .env or to a remote host.'
    );
  }

  const parentDbUrl = process.env.DATABASE_URL;
  if (parentDbUrl && !isLocal(parentDbUrl)) {
    throw new Error(
      'E2E refused to start: a non-local DATABASE_URL is set in the ' +
        'parent process environment. This will be inherited by Next.js / ' +
        'Prisma and override the E2E test database. Unset DATABASE_URL ' +
        '(e.g. run with `env -i ... pnpm exec playwright test`) before ' +
        'launching E2E.'
    );
  }
}

assertLocalE2EDatabase();

const IS_CI = !!process.env.CI;
const E2E_PORT = IS_CI ? '3000' : '3099';
// Use 127.0.0.1 (not "localhost") so the standalone server's internal
// SSR fetches resolve to the same interface the server is bound to.
// On macOS, Node resolves "localhost" to IPv6 (::1) first while the
// standalone server binds IPv4-only (0.0.0.0), causing internal fetches
// to fail and pages to render the not-found state.
const E2E_HOST = '127.0.0.1';
const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;
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
      HOSTNAME: E2E_HOST,
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
