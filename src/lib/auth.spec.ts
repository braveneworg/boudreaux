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
vi.mock('@/lib/auth/social-providers-config', () => ({
  buildSocialProvidersConfig: vi.fn(() => ({ google: { clientId: 'g', clientSecret: 'gs' } })),
  accountLinkingConfig: {
    enabled: true,
    trustedProviders: ['google', 'apple', 'facebook'],
  },
}));
vi.mock('@/lib/email/send-magic-link-email', () => ({ sendMagicLinkEmail: vi.fn() }));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findEmailById: vi.fn() },
}));
vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: {
    areSignupsPaused: vi.fn().mockResolvedValue(false),
    isEnvForced: vi.fn(() => false),
  },
}));
// The create hook reads the consent cookie (next/headers) — stub it to "no
// consent" so this node-env wiring test exercises only the username backfill.
vi.mock('@/lib/auth/signup-consent', () => ({
  readAndClearSignupConsent: vi.fn(async () => null),
}));

// A clearly-fake placeholder secret that is ≥32 chars (the validation
// threshold). Built from a repeated filler so it carries no real entropy and
// is never mistaken for a credential.
const FAKE_TEST_SECRET = `test-secret-${'x'.repeat(32)}`;

// ---------------------------------------------------------------------------
// auth.ts integration — socialProviders + accountLinking wiring
//
// The top-level `vi.mock` for `better-auth` gives us a spy on `betterAuth`.
// On the first import (module load), `auth.ts` calls `betterAuth(config)` —
// we can capture that call by importing `betterAuth` and reading its mock
// call args.
// ---------------------------------------------------------------------------
describe('src/lib/auth — socialProviders + accountLinking wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calls betterAuth with socialProviders and account.accountLinking', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');

    await import('./auth');

    const { betterAuth: betterAuthSpy } = await import('better-auth');
    const calls = (betterAuthSpy as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const config = calls[calls.length - 1][0];
    // socialProviders is present (value comes from buildSocialProvidersConfig mock)
    expect(config).toHaveProperty('socialProviders');
    // account.accountLinking is wired with enabled + trustedProviders
    expect(config).toHaveProperty('account.accountLinking.enabled', true);
    expect(config.account.accountLinking.trustedProviders).toContain('google');
    expect(config.account.accountLinking.trustedProviders).toContain('apple');
    expect(config.account.accountLinking.trustedProviders).toContain('facebook');
    expect(config.account.accountLinking.trustedProviders).not.toContain('twitter');
  });

  it('exposes username as a server-controlled (read-only) additional session field', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');

    await import('./auth');

    const { betterAuth: betterAuthSpy } = await import('better-auth');
    const calls = (betterAuthSpy as ReturnType<typeof vi.fn>).mock.calls;
    const config = calls[calls.length - 1][0];

    // `username` must ride along on the better-auth session so the client
    // `useSession()` can render the `@username` profile link (desktop header).
    // It is written only via the dedicated change-username action (with its
    // own uniqueness validation), so it is `input: false` — never writable
    // through better-auth's updateUser.
    expect(config.user.additionalFields.username).toEqual({
      type: 'string',
      required: false,
      input: false,
    });
  });

  it('wires a user.create hook that backfills a placeholder username', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');

    await import('./auth');

    const { betterAuth: betterAuthSpy } = await import('better-auth');
    const calls = (betterAuthSpy as ReturnType<typeof vi.fn>).mock.calls;
    const config = calls[calls.length - 1][0];

    // `username` is `@unique`; better-auth's own create paths (magic-link
    // auto-create for an unknown email, OAuth first sign-in) set none, which
    // would collide on the second such user. The `user.create.before` hook
    // backfills a placeholder (detailed behavior in backfill-username-hook.spec).
    const created = await config.databaseHooks.user.create.before({ email: 'new@example.com' });

    expect(created.data.username).toEqual(expect.any(String));
  });

  it('passes disableSignUp: true to magicLink when AUTH_DISABLE_SIGNUP is "true"', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');

    await import('./auth');

    const { magicLink } = await import('better-auth/plugins');
    const calls = (magicLink as ReturnType<typeof vi.fn>).mock.calls;
    const options = calls[calls.length - 1][0];

    // The operational kill switch: AUTH_DISABLE_SIGNUP=true makes the magic-link
    // verify step refuse unknown emails instead of auto-creating an account.
    expect(options.disableSignUp).toBe(true);
  });

  it('defaults disableSignUp to false when AUTH_DISABLE_SIGNUP is unset', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');

    await import('./auth');

    const { magicLink } = await import('better-auth/plugins');
    const calls = (magicLink as ReturnType<typeof vi.fn>).mock.calls;
    const options = calls[calls.length - 1][0];

    // Default posture: signups stay open unless the flag is explicitly 'true'.
    expect(options.disableSignUp).toBe(false);
  });
});

describe('src/lib/auth — multi-origin baseURL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const loadConfig = async (): Promise<Record<string, unknown>> => {
    await import('./auth');
    const { betterAuth: betterAuthSpy } = await import('better-auth');
    const calls = (betterAuthSpy as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1][0];
  };

  it('configures a dynamic baseURL trusting the apex and its subdomains', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', 'https://fakefourrecords.com');

    const config = await loadConfig();

    // Dynamic config lets better-auth resolve the base URL from the served host
    // (apex or any subdomain) so auth stays same-origin and host-only cookies
    // are set first-party; the allowlist is what keeps it injection-safe.
    expect(config.baseURL).toEqual({
      allowedHosts: ['fakefourrecords.com', '*.fakefourrecords.com'],
      protocol: 'https',
      fallback: 'https://fakefourrecords.com',
    });
  });

  it('strips a www prefix so the apex and www resolve to the same allowlist', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', 'https://www.fakefourrecords.com');

    const config = await loadConfig();

    expect(config.baseURL).toMatchObject({
      allowedHosts: ['fakefourrecords.com', '*.fakefourrecords.com'],
      fallback: 'https://www.fakefourrecords.com',
    });
  });

  it('keeps http for a localhost AUTH_URL so dev and E2E stay on http', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', 'http://localhost:3000');

    const config = await loadConfig();

    expect(config.baseURL).toMatchObject({
      allowedHosts: ['localhost:3000', '*.localhost:3000'],
      protocol: 'http',
    });
  });

  it('falls back to no baseURL when AUTH_URL is unset', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', '');

    const config = await loadConfig();

    expect(config.baseURL).toBeUndefined();
  });

  it('passes a malformed AUTH_URL through unchanged as a static base URL', async () => {
    vi.resetModules();
    vi.stubEnv('AUTH_SECRET', FAKE_TEST_SECRET);
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', 'not-a-valid-url');

    const config = await loadConfig();

    expect(config.baseURL).toBe('not-a-valid-url');
  });
});

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
