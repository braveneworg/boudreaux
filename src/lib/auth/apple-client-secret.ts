/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createPrivateKey, sign } from 'crypto';

// Apple requires the client secret to be a JWT signed with ES256 using the
// `.p8` private key. The JWT expires in at most 6 months; the auth config
// re-mints one on every server boot (see social-providers-config.ts) so a
// regularly-deployed instance never approaches expiry.
// Reference: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
const SIX_MONTHS_SECONDS = 15_777_000; // 6 × 30 × 24 × 3600

const base64UrlEncode = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

interface AppleClientSecretInput {
  /** Apple Developer Team ID (10-character string) */
  teamId: string;
  /** Apple Key ID from the .p8 key (10-character string) */
  keyId: string;
  /** Apple Services ID (used as the OAuth client_id) */
  clientId: string;
  /** Contents of the .p8 file (PEM-encoded EC private key) */
  privateKey: string;
}

/**
 * Generates an Apple client-secret JWT signed with ES256.
 *
 * Apple's Sign in with Apple OAuth flow requires the client_secret to be a
 * short-lived JWT rather than a static string. This function generates one
 * from the .p8 private key material.
 *
 * Synchronous by design: it runs inside the better-auth config factory at
 * module init, where an async signer would force top-level await through
 * `src/lib/auth.ts`. node:crypto's `sign` with `dsaEncoding: 'ieee-p1363'`
 * emits the raw r||s signature format JOSE requires (DER would be rejected).
 *
 * @param input - The Apple credentials needed to build the JWT.
 * @returns A signed JWT string to use as the Apple OAuth client_secret.
 */
export const generateAppleClientSecret = ({
  teamId,
  keyId,
  clientId,
  privateKey,
}: AppleClientSecretInput): string => {
  const signingKey = createPrivateKey(privateKey);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: teamId,
      sub: clientId,
      aud: 'https://appleid.apple.com',
      iat: nowSeconds,
      exp: nowSeconds + SIX_MONTHS_SECONDS,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: signingKey,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${base64UrlEncode(signature)}`;
};
