/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  enabledSocialProviders,
  getAppleKeyMaterial,
  getAuthUrl,
  getCloudFrontDistributionId,
  getOAuthClient,
  getStripeWebhookIpRanges,
  isFeatureEnabled,
  resolveS3BucketName,
} from './runtime-config';

vi.mock('server-only', () => ({}));

const SOCIAL_NAMES = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'FACEBOOK_CLIENT_ID',
  'FACEBOOK_CLIENT_SECRET',
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY_BASE64',
  'APPLE_APP_BUNDLE_IDENTIFIER',
];

describe('runtime-config getters', () => {
  beforeEach(() => {
    // Worktrees carry real env files; pin every name these getters read.
    for (const name of [
      ...SOCIAL_NAMES,
      'AUTH_URL',
      'AWS_S3_BUCKET_NAME',
      'S3_BUCKET',
      'CLOUDFRONT_DISTRIBUTION_ID',
      'STRIPE_WEBHOOK_IP_RANGES',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  describe('getAuthUrl', () => {
    it('returns the trimmed AUTH_URL', () => {
      vi.stubEnv('AUTH_URL', ' https://fakefourrecords.com ');

      expect(getAuthUrl()).toBe('https://fakefourrecords.com');
    });

    it('returns undefined when AUTH_URL is empty', () => {
      expect(getAuthUrl()).toBeUndefined();
    });
  });

  describe('resolveS3BucketName', () => {
    it('prefers AWS_S3_BUCKET_NAME', () => {
      vi.stubEnv('AWS_S3_BUCKET_NAME', 'primary-bucket');
      vi.stubEnv('S3_BUCKET', 'legacy-bucket');

      expect(resolveS3BucketName()).toBe('primary-bucket');
    });

    it('falls back to the legacy S3_BUCKET alias', () => {
      vi.stubEnv('S3_BUCKET', 'legacy-bucket');

      expect(resolveS3BucketName()).toBe('legacy-bucket');
    });

    it('returns undefined when neither is set', () => {
      expect(resolveS3BucketName()).toBeUndefined();
    });
  });

  describe('getCloudFrontDistributionId', () => {
    it('returns the distribution id when set', () => {
      vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'E123ABC');

      expect(getCloudFrontDistributionId()).toBe('E123ABC');
    });

    it('returns undefined when unset', () => {
      expect(getCloudFrontDistributionId()).toBeUndefined();
    });
  });

  describe('getStripeWebhookIpRanges', () => {
    it('splits, trims and drops empty entries', () => {
      vi.stubEnv('STRIPE_WEBHOOK_IP_RANGES', ' 3.18.12.63/32, ,3.130.192.231/32,');

      expect(getStripeWebhookIpRanges()).toEqual(['3.18.12.63/32', '3.130.192.231/32']);
    });

    it('returns no ranges when unset', () => {
      expect(getStripeWebhookIpRanges()).toEqual([]);
    });
  });

  describe('getOAuthClient', () => {
    it('returns the client when both halves are set', () => {
      vi.stubEnv('FACEBOOK_CLIENT_ID', 'fb-id');
      vi.stubEnv('FACEBOOK_CLIENT_SECRET', 'fb-secret');

      expect(getOAuthClient('facebook')).toEqual({ clientId: 'fb-id', clientSecret: 'fb-secret' });
    });

    it('returns null for a half-set pair', () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'g-id');

      expect(getOAuthClient('google')).toBeNull();
    });

    it('reads the X client from the TWITTER_ names', () => {
      vi.stubEnv('TWITTER_CLIENT_ID', 'x-id');
      vi.stubEnv('TWITTER_CLIENT_SECRET', 'x-secret');

      expect(getOAuthClient('twitter')).toEqual({ clientId: 'x-id', clientSecret: 'x-secret' });
    });
  });

  describe('getAppleKeyMaterial', () => {
    it('returns each Apple value, undefined when empty', () => {
      vi.stubEnv('APPLE_CLIENT_ID', 'com.example.web');
      vi.stubEnv('APPLE_TEAM_ID', 'TEAM');

      expect(getAppleKeyMaterial()).toEqual({
        clientId: 'com.example.web',
        teamId: 'TEAM',
        keyId: undefined,
        privateKeyBase64: undefined,
        staticSecret: undefined,
        appBundleIdentifier: undefined,
      });
    });
  });

  describe('isFeatureEnabled', () => {
    it('is true for a complete group', () => {
      vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'E123ABC');

      expect(isFeatureEnabled('cloudfrontInvalidation')).toBe(true);
    });

    it('is false for a half-set group', () => {
      vi.stubEnv('APPLE_CLIENT_ID', 'com.example.web');
      vi.stubEnv('APPLE_TEAM_ID', 'TEAM');

      expect(isFeatureEnabled('apple')).toBe(false);
    });
  });

  describe('enabledSocialProviders', () => {
    it('lists no provider when nothing is configured', () => {
      expect(enabledSocialProviders()).toEqual([]);
    });

    it('lists only complete providers, in button order', () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'g-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-secret');
      vi.stubEnv('FACEBOOK_CLIENT_ID', 'fb-id');
      vi.stubEnv('APPLE_CLIENT_ID', 'com.example.web');
      vi.stubEnv('APPLE_TEAM_ID', 'TEAM');
      vi.stubEnv('APPLE_KEY_ID', 'KEY');
      vi.stubEnv('APPLE_PRIVATE_KEY_BASE64', 'cGVt');

      expect(enabledSocialProviders()).toEqual(['apple', 'google']);
    });

    it('enables Apple from a static client secret', () => {
      vi.stubEnv('APPLE_CLIENT_ID', 'com.example.web');
      vi.stubEnv('APPLE_CLIENT_SECRET', 'static-jwt');

      expect(enabledSocialProviders()).toEqual(['apple']);
    });
  });
});
