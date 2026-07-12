/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// generateAppleClientSecret — unit tests
//
// Apple's client secret is a short-lived JWT (ES256) signed with the .p8
// private key. Generation is synchronous (node:crypto) so it can run inside
// the sync better-auth config factory at boot. These tests verify:
//   1. The returned string is a valid 3-part JWT.
//   2. The header carries alg=ES256, kid=KEY_ID.
//   3. The payload carries iss=TEAM_ID, sub=CLIENT_ID, aud="https://appleid.apple.com",
//      and iat/exp within the 6-month window.
//   4. The ES256 signature verifies against the public key (IEEE P1363 format,
//      which is what JOSE consumers like Apple expect — not DER).
// ---------------------------------------------------------------------------

import { generateKeyPairSync, verify } from 'crypto';

import { generateAppleClientSecret } from './apple-client-secret';

vi.mock('server-only', () => ({}));

// Generate a fresh ephemeral EC P-256 key pair for each test run.
// Using crypto.generateKeyPairSync avoids embedding any PEM literal in the
// source tree (which would trigger gitleaks secret-scanning).
const { privateKey: TEST_PRIVATE_KEY_OBJ, publicKey: TEST_PUBLIC_KEY_OBJ } = generateKeyPairSync(
  'ec',
  { namedCurve: 'P-256' }
);
const TEST_PRIVATE_KEY = TEST_PRIVATE_KEY_OBJ.export({ type: 'pkcs8', format: 'pem' }) as string;

const TEST_TEAM_ID = 'ABCDE12345';
const TEST_KEY_ID = 'XYZ987654';
const TEST_CLIENT_ID = 'com.example.boudreaux';

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;

const generate = (): string =>
  generateAppleClientSecret({
    teamId: TEST_TEAM_ID,
    keyId: TEST_KEY_ID,
    clientId: TEST_CLIENT_ID,
    privateKey: TEST_PRIVATE_KEY,
  });

describe('generateAppleClientSecret', () => {
  it('returns a three-part JWT string', () => {
    const token = generate();

    expect(token.split('.')).toHaveLength(3);
  });

  it('sets alg=ES256 and kid=keyId in the protected header', () => {
    const [headerSegment] = generate().split('.');

    const header = decodeSegment(headerSegment);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(TEST_KEY_ID);
  });

  it('sets iss=teamId, sub=clientId, aud=https://appleid.apple.com', () => {
    const [, payloadSegment] = generate().split('.');

    const payload = decodeSegment(payloadSegment);
    expect(payload.iss).toBe(TEST_TEAM_ID);
    expect(payload.sub).toBe(TEST_CLIENT_ID);
    expect(payload.aud).toBe('https://appleid.apple.com');
  });

  it('sets iat to approximately now and exp within 6 months', () => {
    const before = Math.floor(Date.now() / 1000);
    const [, payloadSegment] = generate().split('.');
    const after = Math.floor(Date.now() / 1000);

    const { iat, exp } = decodeSegment(payloadSegment) as { iat: number; exp: number };
    expect(typeof iat).toBe('number');
    expect(typeof exp).toBe('number');

    // iat should be between before and after (with 1s tolerance)
    expect(iat).toBeGreaterThanOrEqual(before - 1);
    expect(iat).toBeLessThanOrEqual(after + 1);

    // exp should be iat + 6 months (15_777_000s ≈ 6 × 30 × 24 × 3600)
    const SIX_MONTHS_SECONDS = 15_777_000;
    expect(exp - iat).toBeLessThanOrEqual(SIX_MONTHS_SECONDS);
    expect(exp - iat).toBeGreaterThan(0);
  });

  it('produces an ES256 signature that verifies against the public key', () => {
    const token = generate();
    const [headerSegment, payloadSegment, signatureSegment] = token.split('.');

    const isValid = verify(
      'sha256',
      Buffer.from(`${headerSegment}.${payloadSegment}`),
      { key: TEST_PUBLIC_KEY_OBJ, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureSegment, 'base64url')
    );
    expect(isValid).toBe(true);
  });

  it('throws when privateKey is invalid PEM', () => {
    expect(() =>
      generateAppleClientSecret({
        teamId: TEST_TEAM_ID,
        keyId: TEST_KEY_ID,
        clientId: TEST_CLIENT_ID,
        privateKey: 'not-a-valid-pem',
      })
    ).toThrow();
  });
});
