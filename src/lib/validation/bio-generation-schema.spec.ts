/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BIO_PROGRESS_STAGES,
  bioGenerationCallbackSchema,
  bioGenerationImageSchema,
  bioGenerationLinkSchema,
  bioGenerationStatusResponseSchema,
  bioProgressPostSchema,
  bioProgressSchema,
  bioStatusImageSchema,
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

describe('bioGenerationCallbackSchema', () => {
  const validData = {
    shortBio: '<p>s</p>',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: null,
    images: [
      {
        url: 'https://cdn.example/a.webp',
        attribution: 'Wikimedia Commons',
        isPrimary: true,
      },
    ],
    links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/X' }],
    model: 'gemini-2.5-flash',
  };

  it('accepts a successful result with valid data', () => {
    const parsed = bioGenerationCallbackSchema.safeParse({
      jobToken: 'x',
      result: { ok: true, data: validData },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a failed result carrying an error', () => {
    const parsed = bioGenerationCallbackSchema.safeParse({
      jobToken: 'x',
      result: { ok: false, error: 'nope' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a missing jobToken', () => {
    const parsed = bioGenerationCallbackSchema.safeParse({
      result: { ok: false, error: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty jobToken', () => {
    const parsed = bioGenerationCallbackSchema.safeParse({
      jobToken: '',
      result: { ok: false, error: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a malformed result', () => {
    const parsed = bioGenerationCallbackSchema.safeParse({
      jobToken: 'x',
      result: { ok: true },
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

describe('bioProgressSchema', () => {
  const validAt = '2026-07-08T00:00:00.000Z';

  it.each(BIO_PROGRESS_STAGES)('accepts the stage %s', (stage) => {
    expect(bioProgressSchema.safeParse({ stage, at: validAt }).success).toBe(true);
  });

  it('rejects an unknown stage', () => {
    expect(bioProgressSchema.safeParse({ stage: 'mastering', at: validAt }).success).toBe(false);
  });

  it('accepts an optional detail within the length cap', () => {
    expect(
      bioProgressSchema.safeParse({ stage: 'drafting', detail: 'x'.repeat(300), at: validAt })
        .success
    ).toBe(true);
  });

  it('rejects a detail longer than 300 characters', () => {
    expect(
      bioProgressSchema.safeParse({ stage: 'drafting', detail: 'x'.repeat(301), at: validAt })
        .success
    ).toBe(false);
  });

  it('accepts non-negative integer counts', () => {
    expect(
      bioProgressSchema.safeParse({ stage: 'commons', counts: { images: 12 }, at: validAt }).success
    ).toBe(true);
  });

  it('rejects a negative count', () => {
    expect(
      bioProgressSchema.safeParse({ stage: 'commons', counts: { images: -1 }, at: validAt }).success
    ).toBe(false);
  });

  it('rejects a fractional count', () => {
    expect(
      bioProgressSchema.safeParse({ stage: 'commons', counts: { images: 1.5 }, at: validAt })
        .success
    ).toBe(false);
  });

  it('rejects a non-ISO at timestamp', () => {
    expect(bioProgressSchema.safeParse({ stage: 'finalizing', at: 'not-a-date' }).success).toBe(
      false
    );
  });
});

describe('bioProgressPostSchema', () => {
  it('accepts a valid post body without an at timestamp (server stamps it)', () => {
    const parsed = bioProgressPostSchema.safeParse({ jobToken: 'tok', stage: 'drafting' });
    expect(parsed.success).toBe(true);
  });

  it('rejects a missing jobToken', () => {
    expect(bioProgressPostSchema.safeParse({ stage: 'drafting' }).success).toBe(false);
  });

  it('rejects an empty jobToken', () => {
    expect(bioProgressPostSchema.safeParse({ jobToken: '', stage: 'drafting' }).success).toBe(
      false
    );
  });

  it('rejects an unknown stage', () => {
    expect(bioProgressPostSchema.safeParse({ jobToken: 'tok', stage: 'nope' }).success).toBe(false);
  });
});

describe('bioGenerationStatusResponseSchema progress field', () => {
  const base = { status: 'processing' as const, error: null, content: null };

  it('accepts a populated progress checkpoint', () => {
    const parsed = bioGenerationStatusResponseSchema.safeParse({
      ...base,
      progress: { stage: 'drafting', detail: 'Writing', at: '2026-07-08T00:00:00.000Z' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a null progress', () => {
    expect(bioGenerationStatusResponseSchema.safeParse({ ...base, progress: null }).success).toBe(
      true
    );
  });

  it('accepts an absent progress', () => {
    expect(bioGenerationStatusResponseSchema.safeParse(base).success).toBe(true);
  });
});

describe('bio status schemas origin field', () => {
  const image = {
    id: '665f1f77bcf86cd799439011',
    url: 'https://cdn.example/a.webp',
    attribution: null,
    isPrimary: false,
  };
  const link = {
    id: '665f1f77bcf86cd799439012',
    label: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/X',
  };

  it('retains a generated origin on a parsed image row', () => {
    expect(bioStatusImageSchema.parse({ ...image, origin: 'generated' }).origin).toBe('generated');
  });

  it('retains a custom origin on a parsed image row', () => {
    expect(bioStatusImageSchema.parse({ ...image, origin: 'custom' }).origin).toBe('custom');
  });

  it('accepts a null origin on an image row', () => {
    expect(bioStatusImageSchema.safeParse({ ...image, origin: null }).success).toBe(true);
  });

  it('accepts an absent origin on an image row', () => {
    expect(bioStatusImageSchema.safeParse(image).success).toBe(true);
  });

  it('rejects an unknown origin string on an image row', () => {
    expect(bioStatusImageSchema.safeParse({ ...image, origin: 'imported' }).success).toBe(false);
  });

  it('retains a custom origin on a parsed link row', () => {
    expect(bioStatusLinkSchema.parse({ ...link, origin: 'custom' }).origin).toBe('custom');
  });

  it('rejects an unknown origin string on a link row', () => {
    expect(bioStatusLinkSchema.safeParse({ ...link, origin: 'imported' }).success).toBe(false);
  });
});

describe('stage-list wire-contract parity (web ↔ Lambda)', () => {
  it('BIO_PROGRESS_STAGES exactly matches PROGRESS_STAGES in bio-generator/src/types.ts, order-sensitive', () => {
    // Read the Lambda types file from disk so any drift between the two projects
    // causes an immediate spec failure — not a silent 202-null route ignore.
    // The spec runs in the node project (*.spec.ts), so node:fs is available.
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const typesPath = resolve(currentDir, '../../..', 'bio-generator/src/types.ts');
    const source = readFileSync(typesPath, 'utf8');

    // Scope the match to the PROGRESS_STAGES const declaration only so an
    // unrelated string array in the same file cannot produce a false negative.
    const blockMatch = /export const PROGRESS_STAGES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source);
    expect(
      blockMatch,
      'PROGRESS_STAGES declaration not found in bio-generator/src/types.ts'
    ).not.toBeNull();
    // The expect above throws when null; this narrowing makes the type system
    // aware that blockMatch is non-null on the lines that follow.
    if (!blockMatch) return;

    // Extract single-quoted string literals from the matched array body.
    const lambdaStages = [...blockMatch[1].matchAll(/'([^']+)'/g)].map(([, s]) => s);

    // Order-sensitive equality: a reorder in either list is a wire-contract break.
    expect(lambdaStages).toEqual([...BIO_PROGRESS_STAGES]);
  });
});
