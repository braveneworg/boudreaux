/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';
import type { SocialProviders } from 'better-auth/social-providers';

// ---------------------------------------------------------------------------
// Social provider configuration factory for better-auth.
//
// Providers are conditionally included: a provider is only wired when BOTH
// its clientId and clientSecret env vars are present and non-empty. This
// prevents crashes in local dev or E2E when a provider's credentials are not
// configured.
//
// Redirect URIs for each provider are automatically served by better-auth at:
//   <AUTH_URL>/api/auth/callback/<provider>
// Register this URL in each provider's developer console.
// ---------------------------------------------------------------------------

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

  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
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
