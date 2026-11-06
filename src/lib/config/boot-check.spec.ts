/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { checkRuntimeConfig, runBootCheck, type BootCheckLogger } from './boot-check';
import { ENV_MANIFEST } from './env-manifest';

vi.mock('server-only', () => ({}));

const configLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const createLoggerMock = vi.hoisted(() => vi.fn(() => configLogger));

vi.mock('@/lib/utils/logger', () => ({ createLogger: createLoggerMock }));

const REQUIRED_RUNTIME = ENV_MANIFEST.filter(
  ({ phase, requirement }) => phase === 'runtime' && requirement === 'required'
).map(({ name }) => name);

/** A complete production env: every required runtime value, valid secrets, no feature groups. */
const completeEnv = (): Record<string, string | undefined> => ({
  ...Object.fromEntries(REQUIRED_RUNTIME.map((name) => [name, `value-of-${name}`])),
  DATABASE_URL: 'mongodb://localhost:27017/test',
  AUTH_SECRET: 'a'.repeat(32),
  JOB_CALLBACK_SECRET: 'j'.repeat(32),
});

const fakeLogger = () => ({
  info: vi.fn<BootCheckLogger['info']>(),
  warn: vi.fn<BootCheckLogger['warn']>(),
  error: vi.fn<BootCheckLogger['error']>(),
});

/** Every message logged at one level. */
const messages = (fn: { mock: { calls: unknown[][] } }): string[] =>
  fn.mock.calls.map(([message]) => String(message));

describe('checkRuntimeConfig', () => {
  describe('required values', () => {
    it('passes a complete production env', () => {
      const logger = fakeLogger();

      const report = checkRuntimeConfig({ env: completeEnv(), logger, isProduction: true });

      expect(report.missingRequired).toEqual([]);
    });

    it('fails boot in production when a required value is missing', () => {
      const env = { ...completeEnv(), AUTH_URL: undefined };

      expect(() => checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true })).toThrow(
        'Missing required environment variables: AUTH_URL'
      );
    });

    it('treats an empty or blank value as missing', () => {
      const env = { ...completeEnv(), DATABASE_URL: '', EMAIL_FROM: '   ' };

      expect(() => checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true })).toThrow(
        'Missing required environment variables: DATABASE_URL, EMAIL_FROM'
      );
    });

    it('logs instead of throwing outside production', () => {
      const logger = fakeLogger();
      const env = { ...completeEnv(), DATABASE_URL: undefined };

      const report = checkRuntimeConfig({ env, logger, isProduction: false });

      expect(report.missingRequired).toEqual(['DATABASE_URL']);
      expect(messages(logger.error)).toEqual([
        expect.stringContaining('Missing required environment variables: DATABASE_URL'),
      ]);
    });

    it('never requires a build-time or local value at runtime', () => {
      const report = checkRuntimeConfig({
        env: completeEnv(),
        logger: fakeLogger(),
        isProduction: true,
      });

      expect(report.missingRequired).not.toContain('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    });
  });

  describe('secret strength', () => {
    it('fails boot in production when AUTH_SECRET is shorter than 32 characters', () => {
      const env = { ...completeEnv(), AUTH_SECRET: 'short' };

      expect(() => checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true })).toThrow(
        'AUTH_SECRET must be at least 32 characters'
      );
    });

    it('fails boot in production when JOB_CALLBACK_SECRET is shorter than 32 characters', () => {
      const env = { ...completeEnv(), JOB_CALLBACK_SECRET: 'short' };

      expect(() => checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true })).toThrow(
        'JOB_CALLBACK_SECRET must be at least 32 characters'
      );
    });

    it('accepts a secret of exactly 32 characters', () => {
      const env = { ...completeEnv(), AUTH_SECRET: 'b'.repeat(32) };

      expect(
        checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true }).weakSecrets
      ).toEqual([]);
    });
  });

  describe('SKIP_ENV_VALIDATION', () => {
    it('skips the required check and says so', () => {
      const logger = fakeLogger();
      const env = { SKIP_ENV_VALIDATION: 'true' };

      const report = checkRuntimeConfig({ env, logger, isProduction: true });

      expect(report.skipped).toBe(true);
      expect(messages(logger.warn)).toContain('Runtime config check skipped (SKIP_ENV_VALIDATION)');
    });

    it('names the build phase when Next.js is building', () => {
      const logger = fakeLogger();
      const env = { SKIP_ENV_VALIDATION: 'true', NEXT_PHASE: 'phase-production-build' };

      checkRuntimeConfig({ env, logger, isProduction: true });

      expect(messages(logger.warn)).toContain('Runtime config check skipped (build phase)');
    });
  });

  describe('feature groups', () => {
    it('logs one error naming the missing half of a half-set pair', () => {
      const logger = fakeLogger();
      const env = { ...completeEnv(), FACEBOOK_CLIENT_ID: 'fb-id' };

      const report = checkRuntimeConfig({ env, logger, isProduction: true });

      expect(report.groups.find(({ id }) => id === 'facebook')?.state).toBe('half-set');
      expect(messages(logger.error)).toEqual([
        expect.stringMatching(/Sign in with Facebook.*FACEBOOK_CLIENT_SECRET/),
      ]);
    });

    it('does not fail boot for a half-set pair', () => {
      const env = { ...completeEnv(), FACEBOOK_CLIENT_ID: 'fb-id' };

      expect(() =>
        checkRuntimeConfig({ env, logger: fakeLogger(), isProduction: true })
      ).not.toThrow();
    });

    it('logs one line per disabled group', () => {
      const logger = fakeLogger();

      checkRuntimeConfig({ env: completeEnv(), logger, isProduction: true });

      const disabled = messages(logger.warn).filter((line) => line.startsWith('Feature disabled'));
      expect(disabled).toHaveLength(7);
      expect(disabled).toContainEqual(expect.stringContaining('CLOUDFRONT_DISTRIBUTION_ID'));
    });

    it('logs nothing for an enabled group', () => {
      const logger = fakeLogger();
      const env = { ...completeEnv(), STRIPE_WEBHOOK_IP_RANGES: '3.18.12.63/32' };

      checkRuntimeConfig({ env, logger, isProduction: true });

      expect(messages(logger.warn).join('\n')).not.toContain('STRIPE_WEBHOOK_IP_RANGES');
    });

    it('never logs a value', () => {
      const logger = fakeLogger();
      const env = { ...completeEnv(), FACEBOOK_CLIENT_ID: 'very-secret-looking-id' };

      checkRuntimeConfig({ env, logger, isProduction: true });

      const logged = JSON.stringify([
        logger.info.mock.calls,
        logger.warn.mock.calls,
        logger.error.mock.calls,
      ]);
      expect(logged).not.toContain('very-secret-looking-id');
      expect(logged).not.toContain('value-of-');
    });
  });

  it('warns when DATABASE_URL is not a MongoDB connection string', () => {
    const logger = fakeLogger();
    const env = { ...completeEnv(), DATABASE_URL: 'postgresql://localhost:5432/test' };

    checkRuntimeConfig({ env, logger, isProduction: true });

    expect(messages(logger.warn)).toContain(
      'DATABASE_URL does not look like a MongoDB connection string'
    );
  });

  it('reports success once the required values pass', () => {
    const logger = fakeLogger();

    checkRuntimeConfig({ env: completeEnv(), logger, isProduction: true });

    expect(messages(logger.info)).toContain('Runtime config check passed');
  });
});

describe('runBootCheck', () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(completeEnv())) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
  });

  it('checks process.env with the CONFIG logger', () => {
    vi.stubEnv('NODE_ENV', 'production');

    runBootCheck();

    expect(createLoggerMock.mock.calls).toEqual([['CONFIG']]);
    expect(messages(configLogger.info)).toContain('Runtime config check passed');
  });

  it('throws in production when a required value is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_URL', '');

    expect(() => runBootCheck()).toThrow('Missing required environment variables: AUTH_URL');
  });

  it('only logs outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AUTH_URL', '');

    expect(runBootCheck().missingRequired).toEqual(['AUTH_URL']);
  });
});
