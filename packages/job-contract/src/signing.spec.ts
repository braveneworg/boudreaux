/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHmac } from 'node:crypto';

import {
  JOB_SIGNATURE_HEADER,
  JOB_SIGNATURE_TOLERANCE_SECONDS,
  deriveJobSigningKey,
  signJobBody,
  verifyJobSignature,
} from './signing';

const SECRET = 'a-thirty-two-character-app-secret-value!';
const JOB = { kind: 'bio-generation', entityId: 'artist-1', jobToken: 'tok-1' } as const;
const NOW = 1_800_000_000;
const BODY = '{"jobToken":"tok-1","result":{"ok":true}}';

describe('JOB_SIGNATURE_HEADER', () => {
  it('is the lower-case header name the routes read', () => {
    expect(JOB_SIGNATURE_HEADER).toBe('x-job-signature');
  });
});

describe('deriveJobSigningKey', () => {
  it('is an HMAC-SHA256 of "<kind>:<entityId>:<jobToken>" under the app secret', () => {
    const expected = createHmac('sha256', SECRET)
      .update('bio-generation:artist-1:tok-1')
      .digest('hex');

    expect(deriveJobSigningKey(SECRET, JOB)).toBe(expected);
  });

  it('changes when any of the kind, entity, or token changes', () => {
    const base = deriveJobSigningKey(SECRET, JOB);

    expect(deriveJobSigningKey(SECRET, { ...JOB, kind: 'image-links' })).not.toBe(base);
    expect(deriveJobSigningKey(SECRET, { ...JOB, entityId: 'artist-2' })).not.toBe(base);
    expect(deriveJobSigningKey(SECRET, { ...JOB, jobToken: 'tok-2' })).not.toBe(base);
  });

  it('changes with the secret', () => {
    expect(deriveJobSigningKey(`${SECRET}x`, JOB)).not.toBe(deriveJobSigningKey(SECRET, JOB));
  });
});

describe('signJobBody', () => {
  it('produces "t=<seconds>,v1=<hex HMAC(key, "<t>.<body>")>"', () => {
    const key = deriveJobSigningKey(SECRET, JOB);
    const expected = createHmac('sha256', key).update(`${NOW}.${BODY}`).digest('hex');

    expect(signJobBody(key, BODY, NOW)).toBe(`t=${NOW},v1=${expected}`);
  });

  it('truncates a fractional timestamp to whole seconds', () => {
    const key = deriveJobSigningKey(SECRET, JOB);

    expect(signJobBody(key, BODY, NOW + 0.9)).toBe(signJobBody(key, BODY, NOW));
  });
});

describe('verifyJobSignature', () => {
  const key = deriveJobSigningKey(SECRET, JOB);
  const verify = (header: string | null, overrides: { body?: string; now?: number } = {}) =>
    verifyJobSignature({
      header,
      rawBody: overrides.body ?? BODY,
      signingKey: key,
      nowSeconds: overrides.now ?? NOW,
    });

  it('accepts a signature made with the same key over the same body', () => {
    expect(verify(signJobBody(key, BODY, NOW))).toEqual({ ok: true });
  });

  it('accepts a signature just inside the tolerance window, either side', () => {
    const tolerance = JOB_SIGNATURE_TOLERANCE_SECONDS;

    expect(verify(signJobBody(key, BODY, NOW - tolerance))).toEqual({ ok: true });
    expect(verify(signJobBody(key, BODY, NOW + tolerance))).toEqual({ ok: true });
  });

  it('reports a missing header', () => {
    expect(verify(null)).toEqual({ ok: false, reason: 'missing' });
    expect(verify('')).toEqual({ ok: false, reason: 'missing' });
  });

  it.each([
    ['no v1', `t=${NOW}`],
    ['no t', 'v1=abc'],
    ['non-numeric t', `t=soon,v1=abc`],
    ['non-hex v1', `t=${NOW},v1=zz`],
    ['odd-length v1', `t=${NOW},v1=abc`],
    ['a different scheme', `t=${NOW},v2=abcd`],
  ])('reports a malformed header (%s)', (_label, header) => {
    expect(verify(header)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('reports a stale signature outside the tolerance window', () => {
    const tolerance = JOB_SIGNATURE_TOLERANCE_SECONDS;

    expect(verify(signJobBody(key, BODY, NOW - tolerance - 1))).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(verify(signJobBody(key, BODY, NOW + tolerance + 1))).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('reports a mismatch when the body was altered after signing', () => {
    const header = signJobBody(key, BODY, NOW);

    expect(verify(header, { body: BODY.replace('true', 'false') })).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });

  it('reports a mismatch when the timestamp was altered after signing', () => {
    const header = signJobBody(key, BODY, NOW).replace(`t=${NOW}`, `t=${NOW + 1}`);

    expect(verify(header)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reports a mismatch for a signature made with a key derived from another token', () => {
    const forgedKey = deriveJobSigningKey(SECRET, { ...JOB, jobToken: 'forged' });

    expect(verify(signJobBody(forgedKey, BODY, NOW))).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('reports a mismatch for a digest of the wrong length without throwing', () => {
    expect(verify(`t=${NOW},v1=abcd`)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('honours a custom tolerance', () => {
    const header = signJobBody(key, BODY, NOW - 10);

    expect(
      verifyJobSignature({
        header,
        rawBody: BODY,
        signingKey: key,
        nowSeconds: NOW,
        toleranceSeconds: 5,
      })
    ).toEqual({ ok: false, reason: 'stale' });
  });
});
