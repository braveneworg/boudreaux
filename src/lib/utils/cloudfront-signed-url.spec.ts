/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateCloudFrontSignedUrl,
  isCloudFrontSigningConfigured,
} from './cloudfront-signed-url';

// PEM-encoded RSA test key (2048-bit). Generated solely for unit tests; not
// associated with any real CloudFront key group.
const TEST_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAuW3M3xUe3jhP7BiR1jGdY6JldGWuMQbE9TpY3v9SS3+XRtlA
ftHCeVjg14m3yj35z+/ezwlT4MvAdL4fBQpINbqPzjPmH7xgrJEU/USGw4o8zk2T
Q3DfYfg8IozOjU/v02jl8r/fqM7VdxcCuM7tD0ddSaUzOPibT4DOnPSMs5jKpsKu
S6fJLGyZNsTjDvPxz9DI9UzM2+xXqvxLpAPTb6QeXpD1Lh3CiR9Bgwz2DQwGfwsf
2ifNcCyWzAaqM/rdC4rtfjxaSsdKcOLY+VHzDhx8RZmiPRTnGFcmH9Gz6rpLrMMS
zMy3hbtl/wYaLm2oV6E14HvMs3hfJlyL1pV6IwIDAQABAoIBAFEJwI1SoiXOj8wf
0ttQBYjL8MrdCh7LU3hP6gTNh0FpUYgY8Pri+ftymOInRk/cUXbjuYxrK+Gd2wEr
WZNRNGvuqsdLhUhfXCk3JMyfmhpFTDvEm1vF35YTyx0sJihDuEnxJ1rLXJiFqnWE
DIw7rJrQp6ZzzOO/6VsJrU4BsxCCAhRrI3eTWVBiPwxcqRRMqAh35VHLWoQ6MK9F
sj5j6avM9lUdvQmkz6gT3kU1dRqncwFM0rLQfAYpDw1A5aAUxw3iMcF9/VBDGCMS
xcS2FFIE0wMW4Jkq5DRQJl0w+Lh6F/BEBhiSPv7rVtY0LoLdN4HDqv8Kqx5LhwGv
Jr+WP/ECgYEA+Z9wdwrROHsKHvSHb2kDcbm1fPWfkPMDlgL2Xg7gXmsy/YFYlpZ7
Cbf7FjnryiMJqbSt8RTyeEyqOEttz2LUWUWYevYJTJpVpzgpv96xOcMRj/wF2Hbn
kr80ImvLI0CB3CEWuGlxIjEfXWYHOvBWttIdqYiAo+nFflUuHOeS6nMCgYEAvkM3
MUcqoOoMOPXAOZUWvchQxWGCQgXKCThR3dtSzOkkWS1UwNl3aDDQS9EnVPB+EZEs
dqIxw7sWJmUaJ8RTqrZHDtXzYqU+BxKwdsZpnOYUMsKGhTK5l4LlF6bqnbxlYRmm
OE4cT6XUwwwf4iccCp46bHFA9kQmd+APg1iLoXECgYAUf1ihJjLLfm9mVOXaDfCs
XYyZIFL0z1fXemrcEN/QmxKB5hvvz8BJUo0McB3LMSJrfo4zWLhGdpfwvc2TPx3a
hmcxvnUlCvqrr6HcHgJ8PrApQEd/8Twt1wHUKt1UHhZuJ57i4YyqvvyJGAY/XJSU
LIMXk9fBSAS9/FbGMLAJawKBgFTH0tSPBCZAvLzN1gIxq5MlmvJ8Ehn2Sg99KTRR
6NCQjsSm6yrRO0PzQLSvFdAtsiy9HkOLPK6Uiw1KsY07lpu/wFf9efrCetNxaTRb
iTiDrR8xTSrKRrdyrJHXXBYtOPFmyULp8PAgX+m+e7yNxpkOl2gEv0UftCBIFp8S
Qk6BAoGBAJqMQQE0TInWVGEzybhKItVTuKVGUwKWh4RCkbDqyd9hovZnvYeTb3yA
2g09hdCGQLDsXaikMv0eA+WuXShwLLVGl0qoCywmh2lkRkx8+2gyJBPQPiU3GIvY
TOOawsVJ3z+4tgAIvlSYx9nkfQEsiyHHNoa7+2eWy2sV82iI/m+M
-----END RSA PRIVATE KEY-----`;

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isCloudFrontSigningConfigured', () => {
  it('returns false when env vars are missing', () => {
    delete process.env.CLOUDFRONT_KEY_PAIR_ID;
    delete process.env.CLOUDFRONT_PRIVATE_KEY;
    delete process.env.CLOUDFRONT_PRIVATE_KEY_BASE64;

    expect(isCloudFrontSigningConfigured()).toBe(false);
  });

  it('returns true when key pair id, private key, and CDN domain are set', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEYPAIRID';
    process.env.CLOUDFRONT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com';

    expect(isCloudFrontSigningConfigured()).toBe(true);
  });
});

describe('generateCloudFrontSignedUrl', () => {
  it('returns null when CloudFront signing is not configured', () => {
    delete process.env.CLOUDFRONT_KEY_PAIR_ID;
    delete process.env.CLOUDFRONT_PRIVATE_KEY;
    delete process.env.CLOUDFRONT_PRIVATE_KEY_BASE64;

    const url = generateCloudFrontSignedUrl({
      s3Key: 'releases/abc/track.mp3',
      fileName: 'track.mp3',
      expiresInSeconds: 3600,
    });

    expect(url).toBeNull();
  });

  it('returns a signed CloudFront URL when configured', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEYPAIRID';
    process.env.CLOUDFRONT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com';

    const url = generateCloudFrontSignedUrl({
      s3Key: 'releases/abc/track.mp3',
      fileName: 'My Album.mp3',
      expiresInSeconds: 3600,
    });

    expect(url).not.toBeNull();
    expect(url).toContain('https://cdn.example.com/releases/abc/track.mp3');
    expect(url).toContain('Key-Pair-Id=KTESTKEYPAIRID');
    expect(url).toContain('Signature=');
    expect(url).toContain('Expires=');
    expect(url).toContain('response-content-disposition=');
  });

  it('accepts a base64-encoded PEM via CLOUDFRONT_PRIVATE_KEY_BASE64', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEYPAIRID';
    delete process.env.CLOUDFRONT_PRIVATE_KEY;
    process.env.CLOUDFRONT_PRIVATE_KEY_BASE64 = Buffer.from(TEST_PRIVATE_KEY, 'utf8').toString(
      'base64'
    );
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com';

    const url = generateCloudFrontSignedUrl({
      s3Key: 'releases/abc/track.mp3',
      fileName: 'track.mp3',
      expiresInSeconds: 3600,
    });

    expect(url).not.toBeNull();
    expect(url).toContain('Signature=');
  });

  it('strips the protocol from the CDN domain when building the URL', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEYPAIRID';
    process.env.CLOUDFRONT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com/';

    const url = generateCloudFrontSignedUrl({
      s3Key: 'releases/abc/track.mp3',
      fileName: 'track.mp3',
      expiresInSeconds: 3600,
    });

    // No double protocol, no double slash before the key.
    expect(url).toMatch(/^https:\/\/cdn\.example\.com\/releases\/abc\/track\.mp3\?/);
  });

  it('returns null and logs when the signing call throws (e.g. malformed PEM)', () => {
    process.env.CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEYPAIRID';
    process.env.CLOUDFRONT_PRIVATE_KEY = 'NOT_A_VALID_PEM';
    process.env.NEXT_PUBLIC_CDN_DOMAIN = 'https://cdn.example.com';

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const url = generateCloudFrontSignedUrl({
      s3Key: 'releases/abc/track.mp3',
      fileName: 'track.mp3',
      expiresInSeconds: 3600,
    });

    expect(url).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('CloudFront signing failed'),
      expect.anything()
    );

    consoleSpy.mockRestore();
  });
});
