/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bioImageDragPayloadSchema, bioLinkDragPayloadSchema } from './bio-dnd-schema';

describe('bioLinkDragPayloadSchema', () => {
  it('parses a valid link payload', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Ceschi',
      kind: 'wikipedia',
      isExternal: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing the url', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({ label: 'x', kind: null, isExternal: true });
    expect(parsed.success).toBe(false);
  });

  it('accepts a null kind', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Site',
      url: 'https://example.com',
      kind: null,
      isExternal: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty label', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: '',
      url: 'https://example.com',
      kind: null,
      isExternal: false,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a javascript: url', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Click',
      url: 'javascript:alert(1)',
      kind: null,
      isExternal: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a site-relative url', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Sad, Fat Luck',
      url: '/releases/665f1f77bcf86cd799439021',
      kind: 'release',
      isExternal: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a protocol-relative url', () => {
    const parsed = bioLinkDragPayloadSchema.safeParse({
      label: 'Sneaky',
      url: '//evil.example.com/path',
      kind: null,
      isExternal: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('bioImageDragPayloadSchema', () => {
  it('parses a valid image payload', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      url: 'https://example.com/photo.jpg',
      thumbnailUrl: null,
      title: null,
      attribution: null,
      alt: 'Artist photo',
      width: null,
      height: null,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing the url', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      thumbnailUrl: null,
      title: null,
      attribution: null,
      alt: 'Artist photo',
      width: null,
      height: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('parses a full image payload with all optional fields', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      url: 'https://example.com/photo.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      title: 'Ceschi Ramos',
      attribution: 'Photo by Example',
      alt: 'Ceschi Ramos portrait',
      width: 800,
      height: 600,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a negative width', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      url: 'https://example.com/photo.jpg',
      thumbnailUrl: null,
      title: null,
      attribution: null,
      alt: 'Artist photo',
      width: -1,
      height: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a javascript: url', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      url: 'javascript:alert(1)',
      thumbnailUrl: null,
      title: null,
      attribution: null,
      alt: 'Artist photo',
      width: null,
      height: null,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a site-relative url (image sources are always remote)', () => {
    const parsed = bioImageDragPayloadSchema.safeParse({
      url: '/media/photo.jpg',
      thumbnailUrl: null,
      title: null,
      attribution: null,
      alt: 'Artist photo',
      width: null,
      height: null,
    });
    expect(parsed.success).toBe(false);
  });
});
