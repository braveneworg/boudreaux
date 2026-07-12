/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { loggers } from '@/lib/utils/logger';

import { generateAppleClientSecret } from './apple-client-secret';

import type { SocialProviders } from 'better-auth/social-providers';

// ---------------------------------------------------------------------------
// Social provider configuration factory for better-auth.
//
// Providers are conditionally included: a provider is only wired when its
// credentials are present and non-empty. This prevents crashes in local dev
// or E2E when a provider's credentials are not configured.
//
// Apple is special: its client secret is a JWT Apple caps at 6 months of
// validity. When the .p8 key material is present (APPLE_TEAM_ID,
// APPLE_KEY_ID, APPLE_PRIVATE_KEY_BASE64) a fresh secret is minted at every
// server boot, so it never approaches expiry on a regularly-deployed
// instance. A static APPLE_CLIENT_SECRET is the fallback for environments
// without the key material.
//
// Redirect URIs for each provider are automatically served by better-auth at:
//   <AUTH_URL>/api/auth/callback/<provider>
// Register this URL in each provider's developer console.
// ---------------------------------------------------------------------------

export interface AppleClientSecretResolution {
  /** Apple Services ID (the OAuth client_id). */
  clientId: string;
  /** The client secret JWT to hand to better-auth. */
  secret: string;
  /** Whether the secret was minted at boot or supplied via APPLE_CLIENT_SECRET. */
  source: 'minted' | 'static';
}

/**
 * Resolves the Apple OAuth client secret, preferring boot-time minting from
 * the .p8 key material over the static APPLE_CLIENT_SECRET env var.
 *
 * A minting failure (bad base64, malformed PEM) is logged and degrades to the
 * static secret when present — never a crash, matching the conditional-wiring
 * philosophy of this module. Returns `null` when Apple is not configured.
 */
export const resolveAppleClientSecret = (): AppleClientSecretResolution | null => {
  const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY_BASE64 } = process.env;
  if (!APPLE_CLIENT_ID) {
    return null;
  }
  if (APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY_BASE64) {
    try {
      const privateKey = Buffer.from(APPLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      const secret = generateAppleClientSecret({
        teamId: APPLE_TEAM_ID,
        keyId: APPLE_KEY_ID,
        clientId: APPLE_CLIENT_ID,
        privateKey,
      });
      return { clientId: APPLE_CLIENT_ID, secret, source: 'minted' };
    } catch (error) {
      loggers.auth.error(
        'Apple client secret minting failed; falling back to APPLE_CLIENT_SECRET',
        error
      );
    }
  }
  if (process.env.APPLE_CLIENT_SECRET) {
    return { clientId: APPLE_CLIENT_ID, secret: process.env.APPLE_CLIENT_SECRET, source: 'static' };
  }
  return null;
};

/**
 * Builds the `socialProviders` config object for `betterAuth({...})`.
 * Only providers with fully-configured credentials are included.
 *
 * Call this once at auth-config init time; it reads `process.env` at call
 * time so that `vi.stubEnv` works in tests without `vi.resetModules()`.
 */
export const buildSocialProvidersConfig = (): SocialProviders => {
  const providers: SocialProviders = {};

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    providers.facebook = {
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    };
  }

  if (process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET) {
    providers.twitter = {
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    };
  }

  const apple = resolveAppleClientSecret();
  if (apple) {
    providers.apple = {
      clientId: apple.clientId,
      clientSecret: apple.secret,
      ...(process.env.APPLE_APP_BUNDLE_IDENTIFIER
        ? { appBundleIdentifier: process.env.APPLE_APP_BUNDLE_IDENTIFIER }
        : {}),
    };
  }

  return providers;
};

/**
 * Account-linking configuration for `betterAuth({...})`.
 *
 * Auto-linking fires when an OAuth provider returns a verified email that
 * matches an existing account **and** the provider is in `trustedProviders`.
 *
 * Twitter is deliberately excluded: X/Twitter does not reliably return an
 * email address without elevated app permissions (the `email` scope requires
 * explicit approval by Twitter/X). Including it in trustedProviders would
 * mean the auto-link path silently falls through on most Twitter sign-ins,
 * which is confusing. Users can manually link a Twitter account from their
 * profile (Task 7).
 */
export const accountLinkingConfig: {
  enabled: boolean;
  trustedProviders: string[];
} = {
  enabled: true,
  trustedProviders: ['google', 'apple', 'facebook'],
};
