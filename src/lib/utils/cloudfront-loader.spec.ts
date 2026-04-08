/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

describe('cloudfrontLoader', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('CDN domain resolution', () => {
    it('uses default CDN domain when no env vars are set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'hero.jpg', width: 800, quality: 75 });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/hero.jpg?w=800&q=75&f=webp'
      );
    });

    it('uses NEXT_PUBLIC_CDN_DOMAIN when set', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://public-cdn.example.com');
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'hero.jpg', width: 800, quality: 75 });

      expect(result).toBe(
        'https://public-cdn.example.com/media/banners/hero.jpg?w=800&q=75&f=webp'
      );
    });

    it('falls through to CDN_DOMAIN when NEXT_PUBLIC_CDN_DOMAIN is not set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      vi.stubEnv('CDN_DOMAIN', 'https://server-cdn.example.com');
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'hero.jpg', width: 800, quality: 75 });

      expect(result).toBe(
        'https://server-cdn.example.com/media/banners/hero.jpg?w=800&q=75&f=webp'
      );
    });
  });

  describe('quality parameter', () => {
    it('uses the provided quality value', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'banner.png', width: 1200, quality: 90 });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/banner.png?w=1200&q=90&f=webp'
      );
    });

    it('defaults to 80 when quality is undefined', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'banner.png', width: 1200, quality: undefined });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/banner.png?w=1200&q=80&f=webp'
      );
    });

    it('defaults to 80 when quality is 0', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'banner.png', width: 1200, quality: 0 });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/banner.png?w=1200&q=80&f=webp'
      );
    });
  });

  describe('URL interpolation', () => {
    it('interpolates different src values correctly', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({
        src: 'promo/summer-sale.webp',
        width: 640,
        quality: 75,
      });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/promo/summer-sale.webp?w=640&q=75&f=webp'
      );
    });

    it('interpolates width correctly', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const narrow = cloudfrontLoader({ src: 'hero.jpg', width: 320, quality: 75 });
      const wide = cloudfrontLoader({ src: 'hero.jpg', width: 1920, quality: 75 });

      expect(narrow).toBe(
        'https://cdn.fakefourrecords.com/media/banners/hero.jpg?w=320&q=75&f=webp'
      );
      expect(wide).toBe(
        'https://cdn.fakefourrecords.com/media/banners/hero.jpg?w=1920&q=75&f=webp'
      );
    });

    it('caps width at 1920 when a larger width is requested', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({ src: 'hero.jpg', width: 3840, quality: 75 });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/hero.jpg?w=1920&q=75&f=webp'
      );
    });

    it('percent-encodes spaces and special characters in the filename', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({
        src: 'FFINC Banner 1_5_1920.webp',
        width: 800,
        quality: 75,
      });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/FFINC%20Banner%201_5_1920.webp?w=800&q=75&f=webp'
      );
    });

    it('encodes each path segment independently when src contains slashes', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { cloudfrontLoader } = await import('@/lib/utils/cloudfront-loader');

      const result = cloudfrontLoader({
        src: 'folder name/file name.webp',
        width: 800,
        quality: 75,
      });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/folder%20name/file%20name.webp?w=800&q=75&f=webp'
      );
    });
  });
});
