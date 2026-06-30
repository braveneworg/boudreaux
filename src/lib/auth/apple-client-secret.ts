/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SignJWT, importPKCS8 } from 'jose';

// Apple requires the client secret to be a JWT signed with ES256 using the
// `.p8` private key. The JWT expires in at most 6 months; rotate before then.
// Reference: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
const SIX_MONTHS_SECONDS = 15_777_000; // 6 × 30 × 24 × 3600

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
 * from the .p8 private key material stored in environment variables.
 *
 * **Rotation**: The JWT is valid for up to 6 months. Regenerate and deploy a
 * fresh APPLE_CLIENT_SECRET (or rotate APPLE_PRIVATE_KEY + regenerate) before
 * the existing secret expires to avoid sign-in failures.
 *
 * @param input - The Apple credentials needed to build the JWT.
 * @returns A signed JWT string to use as the Apple OAuth client_secret.
 */
export const generateAppleClientSecret = async ({
  teamId,
  keyId,
  clientId,
  privateKey,
}: AppleClientSecretInput): Promise<string> => {
  const signingKey = await importPKCS8(privateKey, 'ES256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime(`${SIX_MONTHS_SECONDS}s`)
    .sign(signingKey);
};
