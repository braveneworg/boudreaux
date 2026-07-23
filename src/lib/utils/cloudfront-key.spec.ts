/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKeyPairSync } from 'node:crypto';

import { loggers } from '@/lib/utils/logger';

import { resolveCloudfrontPrivateKey } from './cloudfront-key';

/** A real key — resolution now parses the PEM, so a fake body would be rejected. */
const REAL_PEM = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
}).privateKey.trim();
const REAL_PEM_BASE64 = Buffer.from(REAL_PEM).toString('base64');

/** A PKCS#1 (RSA) real key, for the alternate PEM label. */
const REAL_RSA_PEM = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
}).privateKey.trim();

/** PEM header + END marker but a body that is not a parseable key. */
const CORRUPT_PEM = '-----BEGIN PRIVATE KEY-----\nbm90LWEta2V5\n-----END PRIVATE KEY-----';

describe('resolveCloudfrontPrivateKey', () => {
  it('decodes and accepts a base64-encoded PEM', () => {
    expect(resolveCloudfrontPrivateKey(REAL_PEM_BASE64)).toBe(REAL_PEM);
  });

  it('accepts a PEM stored directly instead of its base64', () => {
    expect(resolveCloudfrontPrivateKey(REAL_PEM)).toBe(REAL_PEM);
  });

  it('accepts the PKCS#1 (RSA) PEM label', () => {
    expect(resolveCloudfrontPrivateKey(Buffer.from(REAL_RSA_PEM).toString('base64'))).toBe(
      REAL_RSA_PEM
    );
  });

  it('trims surrounding whitespace before decoding', () => {
    expect(resolveCloudfrontPrivateKey(`  ${REAL_PEM_BASE64}\n`)).toBe(REAL_PEM);
  });

  it('restores escaped newlines in a directly-stored PEM', () => {
    const escaped = REAL_PEM.replace(/\n/g, '\\n');
    expect(resolveCloudfrontPrivateKey(escaped)).toBe(REAL_PEM);
  });

  it('returns null for a value that is neither a PEM nor base64-of-PEM', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    expect(resolveCloudfrontPrivateKey(Buffer.from('not a key').toString('base64'))).toBeNull();

    errSpy.mockRestore();
  });

  it('logs a diagnostic naming a non-PEM value', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    resolveCloudfrontPrivateKey('utter-garbage-value');

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('did not resolve to a PEM'),
      expect.objectContaining({ decodedStartsWithDashes: false })
    );
    errSpy.mockRestore();
  });

  it('returns null when the value has a PEM header but an unparseable body', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    expect(resolveCloudfrontPrivateKey(CORRUPT_PEM)).toBeNull();

    errSpy.mockRestore();
  });

  it('logs a distinct diagnostic (with the candidate length) for a corrupt body', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    resolveCloudfrontPrivateKey(CORRUPT_PEM);

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a parseable'),
      expect.objectContaining({ candidateLength: CORRUPT_PEM.length })
    );
    errSpy.mockRestore();
  });

  it('rejects a header-only truncated key (the .env truncation failure mode)', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    expect(resolveCloudfrontPrivateKey('-----BEGIN PRIVATE KEY-----')).toBeNull();

    errSpy.mockRestore();
  });

  it('never puts key material in the diagnostic log', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    resolveCloudfrontPrivateKey(CORRUPT_PEM);

    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('bm90LWEta2V5');
    errSpy.mockRestore();
  });
});
