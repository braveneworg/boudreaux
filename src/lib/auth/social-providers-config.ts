/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  enabledSocialProviders,
  getAppleKeyMaterial,
  getOAuthClient,
  type OAuthClient,
} from '@/lib/config/runtime-config';
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
  const { clientId, teamId, keyId, privateKeyBase64, staticSecret } = getAppleKeyMaterial();
  if (!clientId) {
    return null;
  }
  if (teamId && keyId && privateKeyBase64) {
    try {
      const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      const secret = generateAppleClientSecret({ teamId, keyId, clientId, privateKey });
      return { clientId, secret, source: 'minted' };
    } catch (error) {
      loggers.auth.error(
        'Apple client secret minting failed; falling back to APPLE_CLIENT_SECRET',
        error
      );
    }
  }
  if (staticSecret) {
    return { clientId, secret: staticSecret, source: 'static' };
  }
  return null;
};

/**
 * Builds the `socialProviders` config object for `betterAuth({...})`.
 *
 * Registers exactly the providers `enabledSocialProviders()` lists — the same
 * list the sign-in and profile pages render buttons for — so a button never
 * shows for a provider the server did not register. The one exception is an
 * Apple secret that fails to mint with no static fallback: that is logged as
 * an error and Apple is left out.
 *
 * Call this once at auth-config init time; it reads `process.env` at call
 * time so that `vi.stubEnv` works in tests without `vi.resetModules()`.
 */
export const buildSocialProvidersConfig = (): SocialProviders => {
  const enabled = new Set(enabledSocialProviders());
  /** The id/secret client of an enabled provider; undefined when it is off. */
  const clientFor = (provider: 'google' | 'facebook' | 'twitter'): OAuthClient | undefined =>
    (enabled.has(provider) ? getOAuthClient(provider) : null) ?? undefined;

  const google = clientFor('google');
  const facebook = clientFor('facebook');
  const twitter = clientFor('twitter');
  const apple = enabled.has('apple') ? appleProviderConfig() : undefined;

  return {
    ...(google ? { google } : {}),
    ...(facebook ? { facebook } : {}),
    ...(twitter ? { twitter } : {}),
    ...(apple ? { apple } : {}),
  };
};

/** Apple's better-auth config, or undefined when no client secret resolves. */
const appleProviderConfig = (): SocialProviders['apple'] => {
  const apple = resolveAppleClientSecret();
  if (!apple) {
    return undefined;
  }
  const { appBundleIdentifier } = getAppleKeyMaterial();
  return {
    clientId: apple.clientId,
    clientSecret: apple.secret,
    ...(appBundleIdentifier ? { appBundleIdentifier } : {}),
  };
};

/**
 * Account-linking configuration for `betterAuth({...})`.
 *
 * Auto-linking fires when an OAuth provider returns a verified email that
 * matches an existing account **and** the provider is in `trustedProviders`.
 *
 * Twitter is deliberately excluded: X only returns an email when the app has
 * "Request email from users" enabled AND the user has a confirmed email on
 * their X account (better-auth requests the `users.email` scope and reads
 * `confirmed_email`; when absent it stores a placeholder email with
 * `emailVerified: false`). Including it in trustedProviders would mean the
 * auto-link path silently falls through on those sign-ins, which is
 * confusing. Users can manually link an X account from their profile.
 */
export const accountLinkingConfig: {
  enabled: boolean;
  trustedProviders: string[];
} = {
  enabled: true,
  trustedProviders: ['google', 'apple', 'facebook'],
};
