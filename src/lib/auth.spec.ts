/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));
vi.mock('better-auth', () => ({ betterAuth: vi.fn(() => ({})) }));
vi.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: vi.fn(() => ({})) }));
vi.mock('better-auth/next-js', () => ({ nextCookies: vi.fn(() => ({})) }));
vi.mock('better-auth/plugins', () => ({
  admin: vi.fn(() => ({})),
  magicLink: vi.fn(() => ({})),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/ban-evasion-hook', () => ({ assertNotBanEvading: vi.fn() }));
vi.mock('@/lib/email/send-magic-link-email', () => ({ sendMagicLinkEmail: vi.fn() }));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findEmailById: vi.fn() },
}));

// A clearly-fake placeholder secret that is ≥32 chars (the validation
// threshold). Built from a repeated filler so it carries no real entropy and
// is never mistaken for a credential.
const FAKE_TEST_SECRET = `test-secret-${'x'.repeat(32)}`;

describe('src/lib/auth — AUTH_SECRET + E2E_MODE guards', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when E2E_MODE is true in production', async () => {
    vi.resetModules();
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);

    await expect(async () => import('./auth')).rejects.toThrow(
      'E2E_MODE must not be enabled in production'
    );
  });

  it('throws when AUTH_SECRET is missing', async () => {
    vi.resetModules();
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_SECRET', '');

    await expect(async () => import('./auth')).rejects.toThrow(
      'AUTH_SECRET environment variable is required'
    );
  });

  it('throws when AUTH_SECRET is too short', async () => {
    vi.resetModules();
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_SECRET', 'short');

    await expect(async () => import('./auth')).rejects.toThrow(
      'AUTH_SECRET must be at least 32 characters long'
    );
  });

  it('does not throw when E2E_MODE is true in development', async () => {
    vi.resetModules();
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);

    await expect(import('./auth')).resolves.toBeDefined();
  });
});
