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
});
