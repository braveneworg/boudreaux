/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { loggers } from '@/lib/utils/logger';

import { resolveCloudfrontPrivateKey } from './cloudfront-key';

/** A PEM-shaped fake — resolution validates shape, not cryptographic validity. */
const FAKE_PEM = '-----BEGIN PRIVATE KEY-----\nMIIfakefakefake\n-----END PRIVATE KEY-----';
const FAKE_PEM_BASE64 = Buffer.from(FAKE_PEM).toString('base64');

describe('resolveCloudfrontPrivateKey', () => {
  it('decodes a base64-encoded PEM', () => {
    expect(resolveCloudfrontPrivateKey(FAKE_PEM_BASE64)).toBe(FAKE_PEM);
  });

  it('accepts a PEM stored directly instead of its base64', () => {
    expect(resolveCloudfrontPrivateKey(FAKE_PEM)).toBe(FAKE_PEM);
  });

  it('accepts the PKCS#1 (RSA) PEM label', () => {
    const rsa = '-----BEGIN RSA PRIVATE KEY-----\nMIIfake\n-----END RSA PRIVATE KEY-----';
    expect(resolveCloudfrontPrivateKey(Buffer.from(rsa).toString('base64'))).toBe(rsa);
  });

  it('trims surrounding whitespace before decoding', () => {
    expect(resolveCloudfrontPrivateKey(`  ${FAKE_PEM_BASE64}\n`)).toBe(FAKE_PEM);
  });

  it('restores escaped newlines in a directly-stored PEM', () => {
    const escaped = '-----BEGIN PRIVATE KEY-----\\nMIIfakefakefake\\n-----END PRIVATE KEY-----';
    expect(resolveCloudfrontPrivateKey(escaped)).toBe(FAKE_PEM);
  });

  it('returns null for a value that is neither a PEM nor base64-of-PEM', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    expect(resolveCloudfrontPrivateKey(Buffer.from('not a key').toString('base64'))).toBeNull();

    errSpy.mockRestore();
  });

  it('logs a diagnostic naming the misconfiguration when it cannot resolve', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    resolveCloudfrontPrivateKey('utter-garbage-value');

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('CLOUDFRONT_PRIVATE_KEY_BASE64'),
      expect.objectContaining({ decodedStartsWithDashes: false })
    );
    errSpy.mockRestore();
  });

  it('never puts key material in the diagnostic log', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});
    const secretish = 'SUPERSECRETKEYMATERIALABCDEF0123456789';

    resolveCloudfrontPrivateKey(Buffer.from(secretish).toString('base64'));

    expect(JSON.stringify(errSpy.mock.calls)).not.toContain(secretish);
    errSpy.mockRestore();
  });
});
