/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKeyPairSync } from 'node:crypto';

import { loggers } from '@/lib/utils/logger';

import { signStreamUrl } from './sign-stream-url';

vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: vi.fn(({ url }: { url: string }) => `${url}?Signature=signed&Key-Pair-Id=KP1`),
}));

/** A real key — the resolver parses it, though the signer itself is mocked. */
const FAKE_PEM = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
}).privateKey.trim();
const FAKE_PEM_BASE64 = Buffer.from(FAKE_PEM).toString('base64');

const ENV_KEYS = [
  'CLOUDFRONT_KEY_PAIR_ID',
  'CLOUDFRONT_PRIVATE_KEY_BASE64',
  'NEXT_PUBLIC_CDN_DOMAIN',
  'CDN_DOMAIN',
] as const;

describe('signStreamUrl', () => {
  // Start each test with the CloudFront/CDN vars unset; stubs are restored by
  // the global afterEach in setupTests.ts.
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      vi.stubEnv(k, undefined);
    }
  });

  it('returns null when s3Key is missing', () => {
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', FAKE_PEM_BASE64);
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');

    expect(signStreamUrl(null)).toBeNull();
    expect(signStreamUrl(undefined)).toBeNull();
    expect(signStreamUrl('')).toBeNull();
  });

  it('returns null when CloudFront signing is unconfigured', () => {
    expect(signStreamUrl('releases/abc/digital-formats/MP3_320KBPS/track.mp3')).toBeNull();
  });

  it('signs the URL when fully configured (no Content-Disposition for streaming)', () => {
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', FAKE_PEM_BASE64);
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');

    const result = signStreamUrl('releases/abc/digital-formats/MP3_320KBPS/track.mp3');

    expect(result).toBe(
      'https://cdn.example.com/releases/abc/digital-formats/MP3_320KBPS/track.mp3?Signature=signed&Key-Pair-Id=KP1'
    );
    // Streaming URLs must not embed response-content-disposition.
    expect(result).not.toContain('response-content-disposition');
  });

  it('strips https:// prefix and trailing slash from CDN domain', () => {
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', FAKE_PEM_BASE64);
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://cdn.example.com/');

    const result = signStreamUrl('a/b.mp3');
    expect(result?.startsWith('https://cdn.example.com/a/b.mp3')).toBe(true);
  });

  it('signs when the key is stored as a raw PEM rather than base64', () => {
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', FAKE_PEM);
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');

    expect(signStreamUrl('a/b.mp3')).toContain('https://cdn.example.com/a/b.mp3');
  });

  it('fails closed with null and a diagnostic when the key does not resolve', () => {
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', 'not-a-pem-and-not-base64-of-one');
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');

    expect(signStreamUrl('a/b.mp3')).toBeNull();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('CLOUDFRONT_PRIVATE_KEY_BASE64'),
      expect.anything()
    );
    errSpy.mockRestore();
  });

  it('returns null and logs when the signer throws', async () => {
    const signer = await import('@aws-sdk/cloudfront-signer');
    (signer.getSignedUrl as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw Error('boom');
    });
    vi.stubEnv('CLOUDFRONT_KEY_PAIR_ID', 'KP1');
    vi.stubEnv('CLOUDFRONT_PRIVATE_KEY_BASE64', FAKE_PEM_BASE64);
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');
    const errSpy = vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    expect(signStreamUrl('a/b.mp3')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
