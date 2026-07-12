/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// socialProvidersConfig / accountLinkingConfig — unit tests
//
// These tests assert that:
//   1. All four providers (google, facebook, twitter, apple) are wired when
//      their env vars are set.
//   2. Providers are omitted when their env vars are absent (dev-guard).
//   3. accountLinkingConfig has enabled=true with the correct trustedProviders.
//   4. Twitter is NOT in trustedProviders (no reliable email from X/Twitter).
// ---------------------------------------------------------------------------

import { generateKeyPairSync } from 'crypto';

import { loggers } from '@/lib/utils/logger';

import {
  buildSocialProvidersConfig,
  accountLinkingConfig,
  resolveAppleClientSecret,
} from './social-providers-config';

vi.mock('server-only', () => ({}));

// Ephemeral P-256 key for the runtime-minting tests (no PEM literal in the
// tree — gitleaks would flag it).
const { privateKey: MINT_KEY_OBJ } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const MINT_PRIVATE_KEY_BASE64 = Buffer.from(
  MINT_KEY_OBJ.export({ type: 'pkcs8', format: 'pem' }) as string
).toString('base64');

const GOOGLE_VARS = {
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
};
const FACEBOOK_VARS = {
  FACEBOOK_CLIENT_ID: 'fb-id',
  FACEBOOK_CLIENT_SECRET: 'fb-secret',
};
const TWITTER_VARS = {
  TWITTER_CLIENT_ID: 'tw-id',
  TWITTER_CLIENT_SECRET: 'tw-secret',
};
const APPLE_VARS = {
  APPLE_CLIENT_ID: 'apple-id',
  APPLE_CLIENT_SECRET: 'apple-secret',
  APPLE_APP_BUNDLE_IDENTIFIER: 'com.example.boudreaux',
};

const ALL_VARS = { ...GOOGLE_VARS, ...FACEBOOK_VARS, ...TWITTER_VARS, ...APPLE_VARS };

describe('buildSocialProvidersConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('includes all four providers when all env vars are set', () => {
    for (const [key, value] of Object.entries(ALL_VARS)) {
      vi.stubEnv(key, value);
    }

    const config = buildSocialProvidersConfig();
    expect(config).toHaveProperty('google');
    expect(config).toHaveProperty('facebook');
    expect(config).toHaveProperty('twitter');
    expect(config).toHaveProperty('apple');
  });

  it('passes correct clientId/clientSecret to google', () => {
    for (const [key, value] of Object.entries(GOOGLE_VARS)) {
      vi.stubEnv(key, value);
    }

    const config = buildSocialProvidersConfig();
    expect(config.google).toMatchObject({
      clientId: 'google-id',
      clientSecret: 'google-secret',
    });
  });

  it('passes correct clientId/clientSecret to facebook', () => {
    for (const [key, value] of Object.entries(FACEBOOK_VARS)) {
      vi.stubEnv(key, value);
    }

    const config = buildSocialProvidersConfig();
    expect(config.facebook).toMatchObject({
      clientId: 'fb-id',
      clientSecret: 'fb-secret',
    });
  });

  it('passes correct clientId/clientSecret to twitter', () => {
    for (const [key, value] of Object.entries(TWITTER_VARS)) {
      vi.stubEnv(key, value);
    }

    const config = buildSocialProvidersConfig();
    expect(config.twitter).toMatchObject({
      clientId: 'tw-id',
      clientSecret: 'tw-secret',
    });
  });

  it('passes correct clientId, clientSecret, and appBundleIdentifier to apple', () => {
    for (const [key, value] of Object.entries(APPLE_VARS)) {
      vi.stubEnv(key, value);
    }

    const config = buildSocialProvidersConfig();
    expect(config.apple).toMatchObject({
      clientId: 'apple-id',
      clientSecret: 'apple-secret',
      appBundleIdentifier: 'com.example.boudreaux',
    });
  });

  it('omits google when GOOGLE_CLIENT_ID is absent', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-secret');

    const config = buildSocialProvidersConfig();
    expect(config).not.toHaveProperty('google');
  });

  it('omits facebook when FACEBOOK_CLIENT_SECRET is absent', () => {
    vi.stubEnv('FACEBOOK_CLIENT_ID', 'fb-id');
    vi.stubEnv('FACEBOOK_CLIENT_SECRET', '');

    const config = buildSocialProvidersConfig();
    expect(config).not.toHaveProperty('facebook');
  });

  it('omits twitter when TWITTER_CLIENT_ID is absent', () => {
    vi.stubEnv('TWITTER_CLIENT_ID', '');
    vi.stubEnv('TWITTER_CLIENT_SECRET', 'tw-secret');

    const config = buildSocialProvidersConfig();
    expect(config).not.toHaveProperty('twitter');
  });

  it('omits apple when APPLE_CLIENT_ID is absent', () => {
    vi.stubEnv('APPLE_CLIENT_ID', '');
    vi.stubEnv('APPLE_CLIENT_SECRET', 'apple-secret');

    const config = buildSocialProvidersConfig();
    expect(config).not.toHaveProperty('apple');
  });

  it('returns an empty object when no provider env vars are set', () => {
    const config = buildSocialProvidersConfig();
    expect(Object.keys(config)).toHaveLength(0);
  });

  it('mints the apple clientSecret from key material when present', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', MINT_PRIVATE_KEY_BASE64);

    const config = buildSocialProvidersConfig();
    expect(config.apple).toMatchObject({
      clientSecret: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
    });
  });

  it('prefers minting over the static APPLE_CLIENT_SECRET', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_CLIENT_SECRET', 'static-secret');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', MINT_PRIVATE_KEY_BASE64);

    const config = buildSocialProvidersConfig();
    expect(config.apple).not.toMatchObject({ clientSecret: 'static-secret' });
  });

  it('falls back to the static secret when minting fails', () => {
    vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_CLIENT_SECRET', 'static-secret');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', Buffer.from('not-a-pem').toString('base64'));

    const config = buildSocialProvidersConfig();
    expect(config.apple).toMatchObject({ clientSecret: 'static-secret' });
  });

  it('logs an error when minting fails', () => {
    const errorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', Buffer.from('not-a-pem').toString('base64'));

    buildSocialProvidersConfig();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('omits apple when minting fails and no static secret exists', () => {
    vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', Buffer.from('not-a-pem').toString('base64'));

    const config = buildSocialProvidersConfig();
    expect(config).not.toHaveProperty('apple');
  });

  it('keeps appBundleIdentifier alongside a minted secret', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', MINT_PRIVATE_KEY_BASE64);
    vi.stubEnv('APPLE_APP_BUNDLE_IDENTIFIER', 'com.example.boudreaux');

    const config = buildSocialProvidersConfig();
    expect(config.apple).toMatchObject({ appBundleIdentifier: 'com.example.boudreaux' });
  });
});

describe('resolveAppleClientSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns null when APPLE_CLIENT_ID is absent even with key material', () => {
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', MINT_PRIVATE_KEY_BASE64);

    expect(resolveAppleClientSecret()).toBeNull();
  });

  it('reports source=minted when built from key material', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_TEAM_ID', 'TEAM123456');
    vi.stubEnv('APPLE_KEY_ID', 'KEY9876543');
    vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', MINT_PRIVATE_KEY_BASE64);

    expect(resolveAppleClientSecret()).toMatchObject({ clientId: 'apple-id', source: 'minted' });
  });

  it('reports source=static when only APPLE_CLIENT_SECRET is set', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');
    vi.stubEnv('APPLE_CLIENT_SECRET', 'static-secret');

    expect(resolveAppleClientSecret()).toMatchObject({
      secret: 'static-secret',
      source: 'static',
    });
  });

  it('returns null when APPLE_CLIENT_ID is set without any secret source', () => {
    vi.stubEnv('APPLE_CLIENT_ID', 'apple-id');

    expect(resolveAppleClientSecret()).toBeNull();
  });
});

describe('accountLinkingConfig', () => {
  it('has enabled set to true', () => {
    expect(accountLinkingConfig.enabled).toBe(true);
  });

  it('includes google, apple, and facebook in trustedProviders', () => {
    expect(accountLinkingConfig.trustedProviders).toContain('google');
    expect(accountLinkingConfig.trustedProviders).toContain('apple');
    expect(accountLinkingConfig.trustedProviders).toContain('facebook');
  });

  it('does NOT include twitter in trustedProviders', () => {
    expect(accountLinkingConfig.trustedProviders).not.toContain('twitter');
  });
});
