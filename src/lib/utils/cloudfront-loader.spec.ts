/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

describe('banner preload helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('buildBannerPreloadUrl', () => {
    it('builds a CDN URL without query params', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg');

      expect(result).toBe('https://cdn.fakefourrecords.com/media/banners/hero.jpg');
    });

    it('percent-encodes special characters in the filename', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('FFINC Banner 1_5_1920.webp');

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920.webp'
      );
    });

    it('uses NEXT_PUBLIC_CDN_DOMAIN when set', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://public-cdn.example.com');
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg');

      expect(result).toBe('https://public-cdn.example.com/media/banners/hero.jpg');
    });

    it('falls back to CDN_DOMAIN when NEXT_PUBLIC_CDN_DOMAIN is not set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      vi.stubEnv('CDN_DOMAIN', 'https://server-cdn.example.com');
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg');

      expect(result).toBe('https://server-cdn.example.com/media/banners/hero.jpg');
    });
  });

  describe('buildBannerPreloadSrcSet', () => {
    it('builds a srcset string with a single 1920w descriptor', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      expect(result).toBe('https://cdn.fakefourrecords.com/media/banners/hero.jpg 1920w');
    });

    it('percent-encodes special characters in the filename', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('FFINC Banner 1_5_1920.webp');

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920.webp 1920w'
      );
    });

    it('uses configured CDN domain', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://custom-cdn.example.com');
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      expect(result).toContain('https://custom-cdn.example.com/media/banners/hero.jpg');
    });

    it('does not include query params', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      expect(result).not.toContain('?');
      expect(result).not.toContain('w=');
      expect(result).not.toContain('q=');
    });
  });
});
