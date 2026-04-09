/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({
  default: vi.fn(() => ({
    handlers: {},
    auth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));
vi.mock('next-auth/providers/nodemailer', () => ({
  default: vi.fn(() => ({})),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/prisma-adapter', () => ({
  CustomPrismaAdapter: vi.fn(() => ({})),
}));

describe('auth module — E2E_MODE production guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw when E2E_MODE is true in production', async () => {
    vi.resetModules();
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('AUTH_SECRET', 'a-very-long-secret-that-is-at-least-32-characters');

    await expect(async () => import('./auth')).rejects.toThrow(
      'E2E_MODE must not be enabled in production'
    );
  });

  it('should not throw when E2E_MODE is true in development', async () => {
    vi.resetModules();
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.stubEnv('AUTH_SECRET', 'a-very-long-secret-that-is-at-least-32-characters');

    await expect(import('./auth')).resolves.toBeDefined();
  });
});
