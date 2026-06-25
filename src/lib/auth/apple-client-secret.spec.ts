/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// generateAppleClientSecret — unit tests
//
// Apple's client secret is a short-lived JWT (ES256) signed with the .p8
// private key. These tests verify:
//   1. The returned string is a valid 3-part JWT.
//   2. The header carries alg=ES256, kid=KEY_ID.
//   3. The payload carries iss=TEAM_ID, sub=CLIENT_ID, aud="https://appleid.apple.com",
//      and iat/exp within the 6-month window.
// ---------------------------------------------------------------------------

import { generateKeyPairSync } from 'crypto';

import { decodeJwt, decodeProtectedHeader } from 'jose';

import { generateAppleClientSecret } from './apple-client-secret';

vi.mock('server-only', () => ({}));

// Generate a fresh ephemeral EC P-256 key pair for each test run.
// Using crypto.generateKeyPairSync avoids embedding any PEM literal in the
// source tree (which would trigger gitleaks secret-scanning).
const { privateKey: TEST_PRIVATE_KEY_OBJ } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const TEST_PRIVATE_KEY = TEST_PRIVATE_KEY_OBJ.export({ type: 'pkcs8', format: 'pem' }) as string;

const TEST_TEAM_ID = 'ABCDE12345';
const TEST_KEY_ID = 'XYZ987654';
const TEST_CLIENT_ID = 'com.example.boudreaux';

describe('generateAppleClientSecret', () => {
  it('returns a three-part JWT string', async () => {
    const token = await generateAppleClientSecret({
      teamId: TEST_TEAM_ID,
      keyId: TEST_KEY_ID,
      clientId: TEST_CLIENT_ID,
      privateKey: TEST_PRIVATE_KEY,
    });

    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('sets alg=ES256 and kid=keyId in the protected header', async () => {
    const token = await generateAppleClientSecret({
      teamId: TEST_TEAM_ID,
      keyId: TEST_KEY_ID,
      clientId: TEST_CLIENT_ID,
      privateKey: TEST_PRIVATE_KEY,
    });

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBe(TEST_KEY_ID);
  });

  it('sets iss=teamId, sub=clientId, aud=https://appleid.apple.com', async () => {
    const token = await generateAppleClientSecret({
      teamId: TEST_TEAM_ID,
      keyId: TEST_KEY_ID,
      clientId: TEST_CLIENT_ID,
      privateKey: TEST_PRIVATE_KEY,
    });

    const payload = decodeJwt(token);
    expect(payload.iss).toBe(TEST_TEAM_ID);
    expect(payload.sub).toBe(TEST_CLIENT_ID);
    expect(payload.aud).toBe('https://appleid.apple.com');
  });

  it('sets iat to approximately now and exp within 6 months', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await generateAppleClientSecret({
      teamId: TEST_TEAM_ID,
      keyId: TEST_KEY_ID,
      clientId: TEST_CLIENT_ID,
      privateKey: TEST_PRIVATE_KEY,
    });
    const after = Math.floor(Date.now() / 1000);

    const { iat, exp } = decodeJwt(token);
    expect(typeof iat).toBe('number');
    expect(typeof exp).toBe('number');

    // iat should be between before and after (with 1s tolerance)
    expect(iat).toBeGreaterThanOrEqual(before - 1);
    expect(iat).toBeLessThanOrEqual(after + 1);

    // exp should be iat + 6 months (15_777_000s ≈ 6 × 30 × 24 × 3600)
    const SIX_MONTHS_SECONDS = 15_777_000;
    expect((exp as number) - (iat as number)).toBeLessThanOrEqual(SIX_MONTHS_SECONDS);
    expect((exp as number) - (iat as number)).toBeGreaterThan(0);
  });

  it('throws when privateKey is invalid PEM', async () => {
    await expect(
      generateAppleClientSecret({
        teamId: TEST_TEAM_ID,
        keyId: TEST_KEY_ID,
        clientId: TEST_CLIENT_ID,
        privateKey: 'not-a-valid-pem',
      })
    ).rejects.toThrow();
  });
});
