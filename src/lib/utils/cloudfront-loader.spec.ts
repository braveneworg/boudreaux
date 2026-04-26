/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

describe('banner preload helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('buildBannerPreloadUrl', () => {
    it('builds a CDN URL without width suffix when no width is provided', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg');

      expect(result).toBe('https://cdn.fakefourrecords.com/media/banners/hero.jpg');
    });

    it('inserts _w{width} suffix and transcodes raster source to .webp', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg', 1080);

      expect(result).toBe('https://cdn.fakefourrecords.com/media/banners/hero_w1080.webp');
    });

    it('percent-encodes special characters in the filename with width suffix', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('FFINC Banner 1_5_1920.webp', 640);

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920_w640.webp'
      );
    });

    it('percent-encodes special characters without width', async () => {
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

      const result = buildBannerPreloadUrl('hero.jpg', 1920);

      expect(result).toBe('https://public-cdn.example.com/media/banners/hero_w1920.webp');
    });

    it('falls back to CDN_DOMAIN when NEXT_PUBLIC_CDN_DOMAIN is not set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      vi.stubEnv('CDN_DOMAIN', 'https://server-cdn.example.com');
      vi.resetModules();

      const { buildBannerPreloadUrl } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadUrl('hero.jpg', 1920);

      expect(result).toBe('https://server-cdn.example.com/media/banners/hero_w1920.webp');
    });
  });

  describe('buildBannerPreloadSrcSet', () => {
    it('builds a srcset with entries for each device size', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');
      const { IMAGE_VARIANT_DEVICE_SIZES } = await import('@/lib/constants/image-variants');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      const expected = IMAGE_VARIANT_DEVICE_SIZES.map(
        (w) => `https://cdn.fakefourrecords.com/media/banners/hero_w${w}.webp ${w}w`
      ).join(', ');
      expect(result).toBe(expected);
    });

    it('percent-encodes special characters in each srcset entry', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('FFINC Banner 1_5_1920.webp');

      expect(result).toContain(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920_w640.webp 640w'
      );
      expect(result).toContain(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920_w1200.webp 1200w'
      );
    });

    it('uses configured CDN domain', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://custom-cdn.example.com');
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      expect(result).toContain('https://custom-cdn.example.com/media/banners/hero_w640.webp 640w');
      expect(result).toContain(
        'https://custom-cdn.example.com/media/banners/hero_w1200.webp 1200w'
      );
    });

    it('does not include query params', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

      const result = buildBannerPreloadSrcSet('hero.jpg');

      expect(result).not.toContain('?');
    });
  });
});
