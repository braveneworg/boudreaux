/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildCdnUrl } from './cdn-url';

describe('buildCdnUrl', () => {
  const s3Key = 'releases/abc/digital-formats/MP3_320KBPS/tracks/1-file.mp3';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should build a CDN URL from NEXT_PUBLIC_CDN_DOMAIN', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://cdn.example.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.example.com/${s3Key}`);
  });

  it('should strip protocol prefix from NEXT_PUBLIC_CDN_DOMAIN', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://cdn.example.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.example.com/${s3Key}`);
  });

  it('should handle NEXT_PUBLIC_CDN_DOMAIN without protocol', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.example.com/${s3Key}`);
  });

  it('should strip trailing slash from CDN domain', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://cdn.example.com/');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.example.com/${s3Key}`);
  });

  it('should fall back to CDN_DOMAIN when NEXT_PUBLIC_CDN_DOMAIN is not set', () => {
    delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
    vi.stubEnv('CDN_DOMAIN', 'cdn.fallback.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.fallback.com/${s3Key}`);
  });

  it('should prefer NEXT_PUBLIC_CDN_DOMAIN over CDN_DOMAIN', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.public.com');
    vi.stubEnv('CDN_DOMAIN', 'cdn.server.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.public.com/${s3Key}`);
  });

  it('should return raw s3Key when no CDN domain is configured', () => {
    delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
    delete process.env.CDN_DOMAIN;

    expect(buildCdnUrl(s3Key)).toBe(s3Key);
  });

  it('should return raw s3Key when CDN domains are empty strings', () => {
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', '');
    vi.stubEnv('CDN_DOMAIN', '');

    expect(buildCdnUrl(s3Key)).toBe(s3Key);
  });

  it('should return the E2E MP3 fallback for mp3 assets when E2E_MODE is true', () => {
    vi.stubEnv('E2E_MODE', 'true');

    expect(buildCdnUrl(s3Key)).toBe('/e2e/audio/e2e-track-320.mp3');
  });

  it('should return the E2E MP3 fallback for mp3 assets when NEXT_PUBLIC_E2E_MODE is true', () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');

    expect(buildCdnUrl(s3Key)).toBe('/e2e/audio/e2e-track-320.mp3');
  });

  it('should keep non-mp3 assets unchanged in E2E mode', () => {
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.public.com');

    expect(buildCdnUrl('releases/abc/audio/track.flac')).toBe(
      'https://cdn.public.com/releases/abc/audio/track.flac'
    );
  });

  it('should handle http:// prefix on CDN_DOMAIN', () => {
    delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
    vi.stubEnv('CDN_DOMAIN', 'http://cdn.example.com');

    expect(buildCdnUrl(s3Key)).toBe(`https://cdn.example.com/${s3Key}`);
  });
});
