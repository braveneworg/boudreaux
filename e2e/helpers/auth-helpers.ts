/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHmac } from 'node:crypto';

import { getCookies } from 'better-auth/cookies';

/**
 * Shape of a deterministic E2E test user, in the **better-auth** schema (was the
 * legacy Auth.js shape). `emailVerified` is a Boolean flag (not a
 * DateTime), and the admin plugin owns `role` + native ban fields.
 *
 * The `sessionToken` is the opaque better-auth session-row token. The seed
 * inserts a `session` row carrying it; {@link createStorageState} signs it into
 * the session cookie the running server verifies against that row.
 */
export interface TestUser {
  id: string;
  email: string;
  name: string;
  username: string;
  role: 'user' | 'admin';
  /** Opaque better-auth session token; the seeded `session.token` must match. */
  sessionToken: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  banned?: boolean;
  banReason?: string;
  image?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  allowSmsNotifications?: boolean;
}

/**
 * The better-auth session-token cookie name for THIS app's configuration,
 * derived from better-auth's own `getCookies` so it can never drift from the
 * library. `cookiePrefix: 'boudreaux'` → `boudreaux.session_token`; under E2E
 * the standalone server runs over plain HTTP with `useSecureCookies: false`, so
 * there is no `__Secure-` prefix.
 *
 * @see src/lib/auth.ts (`advanced.cookiePrefix`, `advanced.useSecureCookies`)
 */
export const AUTH_COOKIE_NAME = getCookies({
  advanced: { useSecureCookies: false, cookiePrefix: 'boudreaux' },
}).sessionToken.name;

/**
 * Cookie domain. Must match `E2E_HOST` in playwright.config.ts. Using
 * `127.0.0.1` (not "localhost") avoids macOS IPv6 resolution issues where the
 * standalone server binds IPv4 only and SSR internal fetches fail.
 */
export const SESSION_COOKIE_DOMAIN = '127.0.0.1';

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * Sign a session token exactly the way better-auth does when it sets the
 * session cookie. Internally better-auth calls better-call's `setSignedCookie`,
 * which HMAC-SHA256s the value with the configured `secret` and appends the
 * standard-base64 signature: `value = encodeURIComponent(token + '.' + sig)`.
 *
 * Re-implemented with Node `crypto` here (rather than importing better-call's
 * `signCookieValue`, which is gated out of that package's "exports") so the
 * helper has no private-deep-import dependency. The output is byte-for-byte
 * identical and is accepted by the server's `getSignedCookie` verification.
 *
 * @see node_modules/better-call/dist/crypto.mjs (`signCookieValue`)
 */
export const signSessionToken = async (token: string, secret: string): Promise<string> => {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
};

/**
 * Build the Playwright cookie object for a better-auth session token.
 */
export const buildSessionCookie = async (token: string, secret: string) => {
  const value = await signSessionToken(token, secret);

  return {
    name: AUTH_COOKIE_NAME,
    value,
    domain: SESSION_COOKIE_DOMAIN,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: false,
    expires: Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS,
  };
};

/**
 * Generate a Playwright `storageState` carrying a valid better-auth session
 * cookie for a seeded session token. The matching `session` row must exist in
 * the test DB (the seed creates it) for the server to resolve the session.
 */
export const createStorageState = async (token: string, secret: string) => {
  const cookie = await buildSessionCookie(token, secret);
  return {
    cookies: [cookie],
    origins: [],
  };
};
