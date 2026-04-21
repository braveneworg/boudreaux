/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DEFAULT_INLINE_DATA_URI_LIMIT, stripInlineImageDataUris } from './sanitize-response';

describe('stripInlineImageDataUris', () => {
  it('replaces a long data: URI string with null', () => {
    const bigDataUri = 'data:image/jpeg;base64,' + 'A'.repeat(2000);
    expect(stripInlineImageDataUris(bigDataUri)).toBeNull();
  });

  it('leaves a short data: URI untouched (below threshold)', () => {
    const small = 'data:image/png;base64,iVBORw0K'; // <256 chars
    expect(stripInlineImageDataUris(small)).toBe(small);
  });

  it('leaves a CDN URL untouched even if long', () => {
    const url = 'https://cdn.fakefourrecords.com/media/' + 'a'.repeat(400) + '.webp';
    expect(stripInlineImageDataUris(url)).toBe(url);
  });

  it('strips nested data: URIs inside objects and arrays', () => {
    const bigDataUri = 'data:image/jpeg;base64,' + 'B'.repeat(1000);
    const input = {
      id: 'abc',
      release: {
        coverArt: bigDataUri,
        images: [{ src: bigDataUri, caption: 'ok' }],
      },
      tags: ['ok', bigDataUri],
    };
    const out = stripInlineImageDataUris(input);
    expect(out.id).toBe('abc');
    expect(out.release.coverArt).toBeNull();
    expect(out.release.images[0].src).toBeNull();
    expect(out.release.images[0].caption).toBe('ok');
    expect(out.tags[0]).toBe('ok');
    expect(out.tags[1]).toBeNull();
  });

  it('preserves null, numbers, and booleans verbatim', () => {
    const input = { a: null, b: 1, c: true, d: false };
    expect(stripInlineImageDataUris(input)).toEqual(input);
  });

  it('honors a custom maxLen threshold', () => {
    const uri = 'data:image/svg+xml,<svg/>';
    expect(stripInlineImageDataUris(uri, 1)).toBeNull();
    expect(stripInlineImageDataUris(uri, 10_000)).toBe(uri);
  });

  it('only targets data: URIs (other long strings are left alone)', () => {
    const long = 'x'.repeat(5000);
    expect(stripInlineImageDataUris(long)).toBe(long);
  });

  it('exposes the default threshold', () => {
    expect(DEFAULT_INLINE_DATA_URI_LIMIT).toBeGreaterThan(0);
  });

  it('returns null when given null', () => {
    expect(stripInlineImageDataUris(null)).toBeNull();
  });

  it('returns undefined when given undefined', () => {
    expect(stripInlineImageDataUris(undefined)).toBeUndefined();
  });
});
