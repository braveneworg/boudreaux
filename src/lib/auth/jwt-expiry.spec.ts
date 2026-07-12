/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// decodeJwtExpiry — unit tests
//
// The decoder reads the `exp` claim from a JWT payload without verifying the
// signature (we only need the expiry for observability, not trust). It must
// never throw on malformed input — any undecodable token yields null.
// ---------------------------------------------------------------------------

import { decodeJwtExpiry } from './jwt-expiry';

vi.mock('server-only', () => ({}));

const encodeSegment = (value: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('decodeJwtExpiry', () => {
  it('returns the exp claim as a Date', () => {
    const exp = 1_900_000_000;
    const token = `${encodeSegment({ alg: 'ES256' })}.${encodeSegment({ exp })}.signature`;

    expect(decodeJwtExpiry(token)).toEqual(new Date(exp * 1000));
  });

  it('returns null when the token does not have three parts', () => {
    expect(decodeJwtExpiry('not-a-jwt')).toBeNull();
  });

  it('returns null when the payload is not valid JSON', () => {
    const token = `${encodeSegment({ alg: 'ES256' })}.@@garbage@@.signature`;

    expect(decodeJwtExpiry(token)).toBeNull();
  });

  it('returns null when the payload has no exp claim', () => {
    const token = `${encodeSegment({ alg: 'ES256' })}.${encodeSegment({ iss: 'team' })}.signature`;

    expect(decodeJwtExpiry(token)).toBeNull();
  });

  it('returns null when exp is not a number', () => {
    const token = `${encodeSegment({ alg: 'ES256' })}.${encodeSegment({ exp: 'tomorrow' })}.signature`;

    expect(decodeJwtExpiry(token)).toBeNull();
  });

  it('returns null when the payload is JSON but not an object', () => {
    const payload = Buffer.from(JSON.stringify(42)).toString('base64url');
    const token = `${encodeSegment({ alg: 'ES256' })}.${payload}.signature`;

    expect(decodeJwtExpiry(token)).toBeNull();
  });
});
