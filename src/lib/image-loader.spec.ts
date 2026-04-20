/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

describe('imageLoader', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('absolute URLs', () => {
    it('passes through full CDN URLs unchanged', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: 'https://cdn.fakefourrecords.com/media/releases/coverart/cover.jpg',
        width: 640,
      });

      expect(result).toBe('https://cdn.fakefourrecords.com/media/releases/coverart/cover.jpg');
    });

    it('passes through non-CDN https URLs unchanged', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: 'https://www.gravatar.com/avatar/abc?d=retro',
        width: 32,
      });

      expect(result).toBe('https://www.gravatar.com/avatar/abc?d=retro');
    });

    it('passes through blob URLs unchanged', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: 'blob:http://localhost:3000/abc-123',
        width: 200,
      });

      expect(result).toBe('blob:http://localhost:3000/abc-123');
    });

    it('passes through http URLs unchanged', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: 'http://localhost:3000/media/test.jpg',
        width: 640,
      });

      expect(result).toBe('http://localhost:3000/media/test.jpg');
    });
  });

  describe('relative paths', () => {
    it('prepends CDN domain to /media/ paths', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: '/media/particles-6.svg',
        width: 1920,
      });

      expect(result).toBe('https://cdn.fakefourrecords.com/media/particles-6.svg');
    });

    it('prepends CDN domain to banner paths', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: '/media/banners/FFINC Banner 1_5_1920.webp',
        width: 1920,
      });

      expect(result).toBe(
        'https://cdn.fakefourrecords.com/media/banners/FFINC Banner 1_5_1920.webp'
      );
    });

    it('adds leading slash to relative paths without one', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: 'media/icons/external-link-icon.svg',
        width: 22,
      });

      expect(result).toBe('https://cdn.fakefourrecords.com/media/icons/external-link-icon.svg');
    });
  });

  describe('CDN domain configuration', () => {
    it('uses NEXT_PUBLIC_CDN_DOMAIN when set', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'https://custom-cdn.example.com');
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({ src: '/media/test.jpg', width: 640 });

      expect(result).toBe('https://custom-cdn.example.com/media/test.jpg');
    });

    it('falls back to CDN_DOMAIN when NEXT_PUBLIC_CDN_DOMAIN is not set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      vi.stubEnv('CDN_DOMAIN', 'https://server-cdn.example.com');
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({ src: '/media/test.jpg', width: 640 });

      expect(result).toBe('https://server-cdn.example.com/media/test.jpg');
    });

    it('uses hardcoded default when no env vars are set', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({ src: '/media/test.jpg', width: 640 });

      expect(result).toBe('https://cdn.fakefourrecords.com/media/test.jpg');
    });
  });

  describe('width and quality params', () => {
    it('does not append query params to the URL', async () => {
      delete process.env.NEXT_PUBLIC_CDN_DOMAIN;
      delete process.env.CDN_DOMAIN;
      vi.resetModules();

      const { default: imageLoader } = await import('@/lib/image-loader');

      const result = imageLoader({
        src: '/media/releases/coverart/cover.jpg',
        width: 640,
        quality: 75,
      });

      expect(result).not.toContain('?');
      expect(result).not.toContain('w=');
      expect(result).not.toContain('q=');
    });
  });
});
