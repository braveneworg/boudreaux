/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

/**
 * Whether app-issued auth-adjacent cookies (signup consent, Turnstile gate)
 * carry the `Secure` flag. Mirrors better-auth's `useSecureCookies` in
 * `auth.ts`: secure in production, except under E2E where the standalone
 * server runs over plain HTTP (a secure cookie would never be sent back).
 * `auth.ts` refuses to boot with E2E_MODE in real production.
 */
export const useSecureAuthCookies =
  process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
