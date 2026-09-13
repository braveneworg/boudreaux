/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildCdnImageVariantUrl } from './build-cdn-image-variant-url';

describe('buildCdnImageVariantUrl', () => {
  it('returns a relative path with no extension unchanged (no width suffix appended)', () => {
    // Hits the `lastDot === -1` branch in appendWidthSuffix.
    const url = buildCdnImageVariantUrl('/media/releases/coverart/no-extension', 800);
    expect(url).toBe('https://cdn.fakefourrecords.com/media/releases/coverart/no-extension');
  });

  it('returns blob: URLs unchanged', () => {
    expect(buildCdnImageVariantUrl('blob:https://example.com/abc', 800)).toBe(
      'blob:https://example.com/abc'
    );
  });

  it('returns data: URLs unchanged', () => {
    expect(buildCdnImageVariantUrl('data:image/png;base64,AAA', 800)).toBe(
      'data:image/png;base64,AAA'
    );
  });

  it('returns absolute URLs from non-CDN origins unchanged', () => {
    expect(buildCdnImageVariantUrl('https://other.example.com/x.jpg', 800)).toBe(
      'https://other.example.com/x.jpg'
    );
  });

  it('rewrites absolute CDN URLs with a width suffix and webp extension for raster images', () => {
    expect(buildCdnImageVariantUrl('https://cdn.fakefourrecords.com/media/cover.jpg', 1200)).toBe(
      'https://cdn.fakefourrecords.com/media/cover_w1200.webp'
    );
  });

  it('preserves SVG extensions and skips the width suffix', () => {
    expect(buildCdnImageVariantUrl('/media/icon.svg', 800)).toBe(
      'https://cdn.fakefourrecords.com/media/icon.svg'
    );
  });

  it('strips an existing _w{width} suffix before appending a new one', () => {
    expect(buildCdnImageVariantUrl('/media/cover_w1200.jpg', 600)).toBe(
      'https://cdn.fakefourrecords.com/media/cover_w600.webp'
    );
  });

  it('encodes path segments with spaces and reserved characters', () => {
    expect(buildCdnImageVariantUrl('/media/album art/cover.jpg', 800)).toBe(
      'https://cdn.fakefourrecords.com/media/album%20art/cover_w800.webp'
    );
  });

  it('prepends a leading slash for relative paths missing one', () => {
    expect(buildCdnImageVariantUrl('media/cover.jpg', 800)).toBe(
      'https://cdn.fakefourrecords.com/media/cover_w800.webp'
    );
  });

  it('returns a bio/thumbs CDN URL byte-identical regardless of requested width', () => {
    const thumbUrl = 'https://cdn.fakefourrecords.com/media/artists/a1/bio/thumbs/0-3bbd1cf1.webp';
    expect(buildCdnImageVariantUrl(thumbUrl, 640)).toBe(thumbUrl);
    expect(buildCdnImageVariantUrl(thumbUrl, 1200)).toBe(thumbUrl);
  });

  it('returns a video poster CDN URL byte-identical regardless of requested width', () => {
    // Video posters live under media/videos/<id>/ and never get `_w{width}`
    // variants (only cover-art and bio uploads run the variant generator), so
    // rewriting them 403s on the CDN and renders a broken thumbnail.
    const posterUrl =
      'https://cdn.fakefourrecords.com/media/videos/6a562cf7da08ad30064e147c/poster-1784032924133-5gskc1.jpg';
    expect(buildCdnImageVariantUrl(posterUrl, 40)).toBe(posterUrl);
    expect(buildCdnImageVariantUrl(posterUrl, 1200)).toBe(posterUrl);
  });

  it('returns a relative video poster path unchanged apart from the CDN prefix', () => {
    expect(buildCdnImageVariantUrl('/media/videos/abc123/poster-1.png', 640)).toBe(
      'https://cdn.fakefourrecords.com/media/videos/abc123/poster-1.png'
    );
  });

  it('still appends a width suffix for normal media URLs', () => {
    expect(buildCdnImageVariantUrl('https://cdn.fakefourrecords.com/media/cover.jpg', 800)).toBe(
      'https://cdn.fakefourrecords.com/media/cover_w800.webp'
    );
  });
});
