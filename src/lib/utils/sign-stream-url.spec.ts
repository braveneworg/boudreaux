/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { signStreamUrl } from './sign-stream-url';

vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: vi.fn(({ url }: { url: string }) => `${url}?Signature=signed&Key-Pair-Id=KP1`),
}));

const ENV_KEYS = [
  'CLOUDFRONT_KEY_PAIR_ID',
  'CLOUDFRONT_PRIVATE_KEY',
  'CLOUDFRONT_PRIVATE_KEY_BASE64',
  'NEXT_PUBLIC_CDN_DOMAIN',
  'CDN_DOMAIN',
] as const;

describe('signStreamUrl', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('returns null when s3Key is missing', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KP1';
    process.env.CLOUDFRONT_PRIVATE_KEY = 'pem';
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'cdn.example.com';

    expect(signStreamUrl(null)).toBeNull();
    expect(signStreamUrl(undefined)).toBeNull();
    expect(signStreamUrl('')).toBeNull();
  });

  it('returns null when CloudFront signing is unconfigured', () => {
    expect(signStreamUrl('releases/abc/digital-formats/MP3_320KBPS/track.mp3')).toBeNull();
  });

  it('signs the URL when fully configured (no Content-Disposition for streaming)', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KP1';
    process.env.CLOUDFRONT_PRIVATE_KEY = 'pem';
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'cdn.example.com';

    const result = signStreamUrl('releases/abc/digital-formats/MP3_320KBPS/track.mp3');

    expect(result).toBe(
      'https://cdn.example.com/releases/abc/digital-formats/MP3_320KBPS/track.mp3?Signature=signed&Key-Pair-Id=KP1'
    );
    // Streaming URLs must not embed response-content-disposition.
    expect(result).not.toContain('response-content-disposition');
  });

  it('strips https:// prefix and trailing slash from CDN domain', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KP1';
    process.env.CLOUDFRONT_PRIVATE_KEY = 'pem';
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com/';

    const result = signStreamUrl('a/b.mp3');
    expect(result?.startsWith('https://cdn.example.com/a/b.mp3')).toBe(true);
  });

  it('decodes base64 PEM when CLOUDFRONT_PRIVATE_KEY_BASE64 is set', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KP1';
    process.env.CLOUDFRONT_PRIVATE_KEY_BASE64 = Buffer.from('pem-content').toString('base64');
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'cdn.example.com';

    expect(signStreamUrl('a/b.mp3')).toContain('https://cdn.example.com/a/b.mp3');
  });

  it('returns null and logs when the signer throws', async () => {
    const signer = await import('@aws-sdk/cloudfront-signer');
    (signer.getSignedUrl as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw Error('boom');
    });
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KP1';
    process.env.CLOUDFRONT_PRIVATE_KEY = 'pem';
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'cdn.example.com';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(signStreamUrl('a/b.mp3')).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
