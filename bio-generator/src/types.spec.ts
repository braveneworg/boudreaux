/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bioGenerationInputSchema, bioImageSchema, bioLinkSchema } from './types.js';

describe('bioGenerationInputSchema', () => {
  it('parses valid input without optional date fields', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
    });
    expect(result.success).toBe(true);
  });

  it('parses valid input with all three optional date fields', () => {
    const data = bioGenerationInputSchema.parse({
      artistId: 'a1',
      displayName: 'Test Artist',
      bornOn: '1965-03-15',
      diedOn: '2020-11-01',
      formedOn: '1990-06-01',
    });
    expect(data.bornOn).toBe('1965-03-15');
    expect(data.diedOn).toBe('2020-11-01');
    expect(data.formedOn).toBe('1990-06-01');
  });

  it('rejects bornOn with a year-only value (not YYYY-MM-DD)', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      bornOn: '1949',
    });
    expect(result.success).toBe(false);
  });

  it('rejects diedOn with a slash-separated value', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      diedOn: '2020/11/01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects formedOn with a partial (two-digit year) value', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      formedOn: '90-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('parses input with callbackUrl and jobToken', () => {
    const data = bioGenerationInputSchema.parse({
      artistId: 'a1',
      displayName: 'Test Artist',
      callbackUrl: 'https://x/cb',
      jobToken: 'abc',
    });
    expect(data.callbackUrl).toBe('https://x/cb');
    expect(data.jobToken).toBe('abc');
  });

  it('parses input without callbackUrl or jobToken (both optional)', () => {
    const data = bioGenerationInputSchema.parse({
      artistId: 'a1',
      displayName: 'Test Artist',
    });
    expect(data.callbackUrl).toBeUndefined();
    expect(data.jobToken).toBeUndefined();
  });

  it('rejects a non-URL callbackUrl', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      callbackUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty jobToken', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      jobToken: '',
    });
    expect(result.success).toBe(false);
  });

  it('parses input with up to five referenceImageUrls', () => {
    const data = bioGenerationInputSchema.parse({
      artistId: 'a1',
      displayName: 'Test Artist',
      referenceImageUrls: [
        'https://x/1.jpg',
        'https://x/2.jpg',
        'https://x/3.jpg',
        'https://x/4.jpg',
        'https://x/5.jpg',
      ],
    });
    expect(data.referenceImageUrls).toHaveLength(5);
  });

  it('rejects more than five referenceImageUrls', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      referenceImageUrls: [
        'https://x/1.jpg',
        'https://x/2.jpg',
        'https://x/3.jpg',
        'https://x/4.jpg',
        'https://x/5.jpg',
        'https://x/6.jpg',
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-URL referenceImageUrls entry', () => {
    const result = bioGenerationInputSchema.safeParse({
      artistId: 'a1',
      displayName: 'Test Artist',
      referenceImageUrls: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });
});

describe('bio media discovery v2 wire types', () => {
  it('accepts image kind and alt', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      kind: 'cover',
      alt: 'Album cover for Example',
    };
    expect(bioImageSchema.parse(image).kind).toBe('cover');
    expect(bioImageSchema.parse(image).alt).toBe('Album cover for Example');
  });

  it('rejects an unknown image kind', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      kind: 'landscape',
    };
    expect(bioImageSchema.safeParse(image).success).toBe(false);
  });

  it('accepts a machine-readable licenseUrl', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    };
    expect(bioImageSchema.parse(image).licenseUrl).toBe(
      'https://creativecommons.org/licenses/by-sa/4.0/'
    );
  });

  it('accepts a null licenseUrl', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      licenseUrl: null,
    };
    expect(bioImageSchema.parse(image).licenseUrl).toBeNull();
  });

  it('accepts an absent licenseUrl', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
    };
    expect(bioImageSchema.parse(image).licenseUrl).toBeUndefined();
  });

  it('rejects a non-URL licenseUrl', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      licenseUrl: 'not-a-url',
    };
    expect(bioImageSchema.safeParse(image).success).toBe(false);
  });

  it('accepts a hasFace boolean and a faceScore in 0..100', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      hasFace: true,
      faceScore: 91.2,
    };
    expect(bioImageSchema.parse(image).hasFace).toBe(true);
    expect(bioImageSchema.parse(image).faceScore).toBe(91.2);
  });

  it('accepts null hasFace and faceScore (not analyzed)', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      hasFace: null,
      faceScore: null,
    };
    expect(bioImageSchema.parse(image).hasFace).toBeNull();
    expect(bioImageSchema.parse(image).faceScore).toBeNull();
  });

  it('rejects a faceScore above 100', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      faceScore: 101,
    };
    expect(bioImageSchema.safeParse(image).success).toBe(false);
  });

  it('rejects a negative faceScore', () => {
    const image = {
      url: 'https://example.com/a.jpg',
      attribution: 'Someone',
      isPrimary: false,
      faceScore: -1,
    };
    expect(bioImageSchema.safeParse(image).success).toBe(false);
  });

  it('accepts the press link kind', () => {
    const link = { label: 'Interview', url: 'https://example.com/i', kind: 'press' };
    expect(bioLinkSchema.parse(link).kind).toBe('press');
  });

  it('accepts input releases with title, releasedOn, and url', () => {
    const input = {
      artistId: 'a1',
      displayName: 'Ceschi',
      releases: [{ title: 'Broken Bone Ballads', releasedOn: '2015-04-14', url: '/releases/abc' }],
    };
    expect(bioGenerationInputSchema.parse(input).releases?.[0]?.title).toBe('Broken Bone Ballads');
  });

  it('rejects a malformed releasedOn date', () => {
    const input = {
      artistId: 'a1',
      displayName: 'Ceschi',
      releases: [{ title: 'X', releasedOn: '2015/04/14', url: '/releases/abc' }],
    };
    expect(bioGenerationInputSchema.safeParse(input).success).toBe(false);
  });
});
