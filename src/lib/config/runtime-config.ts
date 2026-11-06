/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  FEATURE_GROUPS,
  evaluateFeatureGroup,
  presentEnvNames,
  type FeatureGroupId,
} from './env-manifest';
import { SOCIAL_PROVIDER_IDS, type SocialProviderId } from './social-providers';

/**
 * Typed getters over the runtime configuration manifest (`env-manifest.ts`).
 *
 * Code that switches a feature off when a value is missing reads it here, so
 * there is one place that decides "missing" (unset, empty or blank all count)
 * and one place the boot check and the feature agree on. Each getter reads
 * `process.env` at call time with a literal name, so `vi.stubEnv` works in
 * specs and nothing is captured at module load.
 *
 * Server-only: these are secrets. A client component gets what it needs as a
 * prop from a server component (see `enabledSocialProviders`). `NEXT_PUBLIC_*`
 * values are not read here; client code keeps its literal
 * reads of each `NEXT_PUBLIC_` name, which Next.js inlines at build time.
 */

/** A non-blank value, trimmed; undefined when unset, empty or blank. */
const valueOf = (raw: string | undefined): string | undefined => {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
};

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

export interface AppleKeyMaterial {
  clientId: string | undefined;
  teamId: string | undefined;
  keyId: string | undefined;
  privateKeyBase64: string | undefined;
  /** APPLE_CLIENT_SECRET: a pre-minted secret, used when minting is not possible. */
  staticSecret: string | undefined;
  appBundleIdentifier: string | undefined;
}

/** The canonical public origin (`AUTH_URL`). Required in production by the boot check. */
export const getAuthUrl = (): string | undefined => valueOf(process.env.AUTH_URL);

/**
 * The media bucket. `AWS_S3_BUCKET_NAME` is the production name; `S3_BUCKET`
 * is a legacy alias that CI's E2E run and old local env files still set.
 * Uploads, deletes and key checks all resolve the bucket through here.
 */
export const resolveS3BucketName = (): string | undefined =>
  valueOf(process.env.AWS_S3_BUCKET_NAME) ?? valueOf(process.env.S3_BUCKET);

/** The CloudFront distribution to invalidate; undefined switches invalidation off. */
export const getCloudFrontDistributionId = (): string | undefined =>
  valueOf(process.env.CLOUDFRONT_DISTRIBUTION_ID);

/** The Stripe webhook source CIDRs; empty switches the IP allowlist off. */
export const getStripeWebhookIpRanges = (): string[] =>
  (process.env.STRIPE_WEBHOOK_IP_RANGES ?? '')
    .split(',')
    .map((range) => range.trim())
    .filter((range) => range.length > 0);

const oauthPair = (
  clientId: string | undefined,
  clientSecret: string | undefined
): OAuthClient | null => {
  const id = valueOf(clientId);
  const secret = valueOf(clientSecret);
  return id && secret ? { clientId: id, clientSecret: secret } : null;
};

/** An OAuth client whose credentials are a plain id/secret pair; null unless both are set. */
export const getOAuthClient = (provider: 'google' | 'facebook' | 'twitter'): OAuthClient | null => {
  if (provider === 'google') {
    return oauthPair(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === 'facebook') {
    return oauthPair(process.env.FACEBOOK_CLIENT_ID, process.env.FACEBOOK_CLIENT_SECRET);
  }
  return oauthPair(process.env.TWITTER_CLIENT_ID, process.env.TWITTER_CLIENT_SECRET);
};

/** Apple's values; `social-providers-config.ts` turns them into a client secret. */
export const getAppleKeyMaterial = (): AppleKeyMaterial => ({
  clientId: valueOf(process.env.APPLE_CLIENT_ID),
  teamId: valueOf(process.env.APPLE_TEAM_ID),
  keyId: valueOf(process.env.APPLE_KEY_ID),
  privateKeyBase64: valueOf(process.env.APPLE_PRIVATE_KEY_BASE64),
  staticSecret: valueOf(process.env.APPLE_CLIENT_SECRET),
  appBundleIdentifier: valueOf(process.env.APPLE_APP_BUNDLE_IDENTIFIER),
});

/** Whether a feature group is complete in the current environment. */
export const isFeatureEnabled = (id: FeatureGroupId): boolean => {
  const group = FEATURE_GROUPS.find((candidate) => candidate.id === id);
  return (
    group !== undefined &&
    evaluateFeatureGroup(group, presentEnvNames(process.env)).state === 'enabled'
  );
};

/**
 * The social providers whose credentials are complete, in button order. The
 * one source for both the providers registered with better-auth
 * (`buildSocialProvidersConfig`) and the buttons the sign-in and profile pages
 * render, so a button never shows for a provider the server did not register.
 */
export const enabledSocialProviders = (): SocialProviderId[] =>
  SOCIAL_PROVIDER_IDS.filter((id) => isFeatureEnabled(id));
