/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { linkPreviewSchema } from './link-preview-schema';

const resolvedPreview = {
  url: 'https://artist.test/page',
  resolved: true,
  title: 'A Title',
  description: 'A description',
  siteName: 'Artist Site',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: 'data:image/png;base64,BBBB',
};

const fallbackPreview = {
  url: 'https://artist.test/page',
  resolved: false,
  title: null,
  description: null,
  siteName: 'artist.test',
  imageDataUri: null,
  faviconDataUri: null,
};

describe('linkPreviewSchema', () => {
  it('accepts a fully-resolved preview', () => {
    expect(linkPreviewSchema.safeParse(resolvedPreview).success).toBe(true);
  });

  it('accepts a resolved:false fallback preview with null fields', () => {
    expect(linkPreviewSchema.safeParse(fallbackPreview).success).toBe(true);
  });

  it('returns the parsed url on a successful parse', () => {
    const parsed = linkPreviewSchema.parse(resolvedPreview);
    expect(parsed.url).toBe('https://artist.test/page');
  });

  it('rejects a preview missing the url field', () => {
    const { url: _url, ...rest } = resolvedPreview;
    expect(linkPreviewSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a non-boolean resolved field', () => {
    expect(linkPreviewSchema.safeParse({ ...resolvedPreview, resolved: 'yes' }).success).toBe(
      false
    );
  });

  it('rejects a numeric title (must be string or null)', () => {
    expect(linkPreviewSchema.safeParse({ ...resolvedPreview, title: 42 }).success).toBe(false);
  });

  it('rejects a missing imageDataUri field', () => {
    const { imageDataUri: _imageDataUri, ...rest } = resolvedPreview;
    expect(linkPreviewSchema.safeParse(rest).success).toBe(false);
  });
});
