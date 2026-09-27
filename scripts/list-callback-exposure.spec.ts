/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  formatReport,
  listCallbackExposure,
  parseWindow,
  type ExposureReader,
} from './list-callback-exposure';

const FROM = new Date('2026-07-05T23:26:52.000Z');
const TO = new Date('2026-09-27T00:00:00.000Z');

const makePrisma = (
  generated: Array<{
    id: string;
    slug: string;
    displayName: string | null;
    bioGeneratedAt: Date | null;
  }>,
  linked: Array<{ artistId: string; artist: { slug: string; displayName: string | null } }>
) => {
  const artist = { findMany: vi.fn().mockResolvedValue(generated) };
  const artistBioImage = { findMany: vi.fn().mockResolvedValue(linked) };
  return {
    prisma: { artist, artistBioImage } as unknown as ExposureReader,
    artist,
    artistBioImage,
  };
};

describe('parseWindow', () => {
  it('parses --from and --to as ISO dates', () => {
    expect(parseWindow(['--from', FROM.toISOString(), '--to', TO.toISOString()])).toEqual({
      from: FROM,
      to: TO,
    });
  });

  it.each([
    ['missing --from', ['--to', TO.toISOString()]],
    ['missing --to', ['--from', FROM.toISOString()]],
    ['an invalid date', ['--from', 'yesterday', '--to', TO.toISOString()]],
    [
      'a window that ends before it starts',
      ['--from', TO.toISOString(), '--to', FROM.toISOString()],
    ],
  ])('throws on %s', (_label, argv) => {
    expect(() => parseWindow(argv)).toThrow();
  });
});

describe('listCallbackExposure', () => {
  it('reads only — findMany on artists and linked images, bounded to the window', async () => {
    const { prisma, artist, artistBioImage } = makePrisma([], []);

    await listCallbackExposure(prisma, { from: FROM, to: TO });

    expect(artist.findMany.mock.calls).toEqual([
      [
        {
          where: { bioGeneratedAt: { gte: FROM, lt: TO } },
          select: { id: true, slug: true, displayName: true, bioGeneratedAt: true },
        },
      ],
    ]);
    expect(artistBioImage.findMany.mock.calls).toEqual([
      [
        {
          where: { origin: 'linked', createdAt: { gte: FROM, lt: TO } },
          select: { artistId: true, artist: { select: { slug: true, displayName: true } } },
        },
      ],
    ]);
    expect(Object.keys(artist)).toEqual(['findMany']);
    expect(Object.keys(artistBioImage)).toEqual(['findMany']);
  });

  it('merges a generated bio and linked images for the same artist into one row', async () => {
    const generatedAt = new Date('2026-08-01T00:00:00.000Z');
    const { prisma } = makePrisma(
      [{ id: 'a1', slug: 'ceschi', displayName: 'Ceschi', bioGeneratedAt: generatedAt }],
      [
        { artistId: 'a1', artist: { slug: 'ceschi', displayName: 'Ceschi' } },
        { artistId: 'a1', artist: { slug: 'ceschi', displayName: 'Ceschi' } },
      ]
    );

    const rows = await listCallbackExposure(prisma, { from: FROM, to: TO });

    expect(rows).toEqual([
      {
        artistId: 'a1',
        slug: 'ceschi',
        displayName: 'Ceschi',
        bioGeneratedAt: generatedAt,
        linkedImagesInWindow: 2,
      },
    ]);
  });

  it('lists an artist with linked images but no generated bio, sorted by slug', async () => {
    const { prisma } = makePrisma(
      [{ id: 'z1', slug: 'zeta', displayName: null, bioGeneratedAt: new Date('2026-08-02') }],
      [{ artistId: 'a1', artist: { slug: 'alpha', displayName: 'Alpha' } }]
    );

    const rows = await listCallbackExposure(prisma, { from: FROM, to: TO });

    expect(rows.map(({ slug }) => slug)).toEqual(['alpha', 'zeta']);
    expect(rows[0]).toMatchObject({ bioGeneratedAt: null, linkedImagesInWindow: 1 });
  });
});

describe('formatReport', () => {
  it('prints the window, the count, and one line per artist', () => {
    const report = formatReport(
      [
        {
          artistId: 'a1',
          slug: 'ceschi',
          displayName: 'Ceschi',
          bioGeneratedAt: new Date('2026-08-01T00:00:00.000Z'),
          linkedImagesInWindow: 2,
        },
      ],
      { from: FROM, to: TO }
    );

    expect(report).toBe(
      [
        `Callback exposure ${FROM.toISOString()} → ${TO.toISOString()}: 1 artist(s)`,
        '- ceschi (Ceschi): bio 2026-08-01T00:00:00.000Z, linked images 2',
      ].join('\n')
    );
  });
});
