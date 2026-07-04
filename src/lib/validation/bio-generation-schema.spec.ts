/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  bioGenerationImageSchema,
  bioGenerationLinkSchema,
  bioGenerationStatusResponseSchema,
  bioStatusLinkSchema,
  isInFlightBioStatus,
} from './bio-generation-schema';

describe('isInFlightBioStatus', () => {
  it('returns true for a pending job', () => {
    expect(isInFlightBioStatus('pending')).toBe(true);
  });

  it('returns true for a processing job', () => {
    expect(isInFlightBioStatus('processing')).toBe(true);
  });

  it('returns false for a succeeded job', () => {
    expect(isInFlightBioStatus('succeeded')).toBe(false);
  });

  it('returns false for a failed job', () => {
    expect(isInFlightBioStatus('failed')).toBe(false);
  });

  it('returns false when the artist has never generated (null)', () => {
    expect(isInFlightBioStatus(null)).toBe(false);
  });

  it('returns false when the status is undefined', () => {
    expect(isInFlightBioStatus(undefined)).toBe(false);
  });
});

describe('bioGenerationStatusResponseSchema content rows', () => {
  const baseContent = {
    shortBio: '<p>s</p>',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: null,
    model: 'gemini-2.5-flash',
  };

  it('accepts images carrying a row id', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [
          {
            id: '665f1f77bcf86cd799439011',
            url: 'https://cdn.example/a.webp',
            attribution: 'Wikimedia Commons',
            isPrimary: false,
          },
        ],
        links: [],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts links carrying a row id', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [
          {
            id: '665f1f77bcf86cd799439012',
            label: 'Wikipedia',
            url: 'https://en.wikipedia.org/wiki/X',
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a site-relative release link url', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [
          {
            id: '665f1f77bcf86cd799439013',
            label: 'Album',
            url: '/releases/665f1f77bcf86cd799439014',
            kind: 'release',
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a status link url that is neither http(s) nor site-relative', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [{ id: '665f1f77bcf86cd799439015', label: 'Bad', url: 'javascript:alert(1)' }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts an image with null attribution', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [
          {
            id: '665f1f77bcf86cd799439016',
            url: 'https://cdn.example/b.webp',
            attribution: null,
            isPrimary: false,
          },
        ],
        links: [],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a protocol-relative status link url', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      status: 'succeeded',
      error: null,
      content: {
        ...baseContent,
        images: [],
        links: [{ id: '665f1f77bcf86cd799439017', label: 'Evil', url: '//evil.com/x' }],
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('media v2 wire additions', () => {
  it('accepts image kind and alt', () => {
    const image = {
      url: 'https://cdn.example.com/a.jpg',
      attribution: 'CAA',
      isPrimary: false,
      kind: 'cover',
      alt: 'Album cover',
    };
    const parsed = bioGenerationImageSchema.parse(image);
    expect(parsed.kind).toBe('cover');
    expect(parsed.alt).toBe('Album cover');
  });

  it('rejects unknown image kinds', () => {
    expect(
      bioGenerationImageSchema.safeParse({
        url: 'https://cdn.example.com/a.jpg',
        attribution: 'CAA',
        isPrimary: false,
        kind: 'gif',
      }).success
    ).toBe(false);
  });

  it('accepts press links on both wire and status schemas', () => {
    expect(
      bioGenerationLinkSchema.parse({ label: 'Review', url: 'https://z.net/r', kind: 'press' }).kind
    ).toBe('press');
    expect(
      bioStatusLinkSchema.parse({ id: 'x', label: 'Review', url: 'https://z.net/r', kind: 'press' })
        .kind
    ).toBe('press');
  });
});
