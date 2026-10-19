/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ArtistPageBioImageRecord } from '@/lib/types/domain/artist';

import {
  buildArtistPageModel,
  buildLatestRelease,
  cardDisplayImages,
  type ArtistPageSource,
  type LatestReleaseSourceRow,
} from './artist-page-model';

vi.mock('server-only', () => ({}));

const ARTIST_ID = 'marguerite';
const PUBLISHED = new Date('2024-01-01T00:00:00.000Z');

/** A credited artist as the reads select it: public unless overridden. */
const creditArtist = (
  id: string,
  overrides: { displayName?: string | null; publishedOn?: Date | null } = {}
) => ({
  id,
  slug: id,
  firstName: 'First',
  surname: id,
  displayName: null,
  publishedOn: PUBLISHED,
  deletedOn: null,
  ...overrides,
});

const SELF = creditArtist(ARTIST_ID);

interface ReleaseOptions {
  /** The credits in stored order; the first is the album artist. */
  credits?: Array<ReturnType<typeof creditArtist>>;
  releasedOn?: string;
  publishedAt?: Date | null;
  /** Whether the release holds an MP3 track. */
  mp3?: boolean;
}

/** One release join row, credited to this artist alone unless overridden. */
const releaseRow = (
  id: string,
  {
    credits = [SELF],
    releasedOn = '2024-01-01',
    publishedAt = PUBLISHED,
    mp3 = true,
  }: ReleaseOptions = {}
): LatestReleaseSourceRow => ({
  release: {
    id,
    title: `Release ${id}`,
    releasedOn: new Date(releasedOn),
    publishedAt,
    deletedOn: null,
    digitalFormats: mp3 ? [{ files: [{ s3Key: `releases/${id}/tracks/01.mp3` }] }] : [],
    artistReleases: credits.map((artist) => ({ artistId: artist.id, artist })),
  },
});

/** A band the artist belongs to, public unless overridden, with its releases. */
const band = (
  id: string,
  releases: LatestReleaseSourceRow[],
  overrides: { publishedOn?: Date | null } = {}
): ArtistPageSource['memberOf'][number] => ({
  artist: { ...creditArtist(id), ...overrides, releases },
});

const bioImage = (
  id: string,
  overrides: Partial<ArtistPageBioImageRecord> = {}
): ArtistPageBioImageRecord => ({
  id,
  url: `https://cdn.example/${id}.jpg`,
  thumbnailUrl: null,
  alt: `${id} described`,
  title: null,
  attribution: null,
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
  isPrimary: false,
  displayOrder: null,
  ...overrides,
});

const pageSource = (overrides: Partial<ArtistPageSource> = {}): ArtistPageSource => ({
  id: ARTIST_ID,
  displayName: 'Marguerite Ash',
  firstName: 'Marguerite',
  middleName: null,
  surname: 'Ash',
  title: null,
  suffix: null,
  slug: 'marguerite-ash',
  genres: 'noise-rock',
  links: null,
  bio: '<p>Born in a van.</p>',
  shortBio: '<p>A short bio.</p>',
  bioImages: [],
  releases: [],
  memberOf: [],
  ...overrides,
});

const ids = (rows: Array<{ id: string }>): string[] => rows.map(({ id }) => id);

describe('cardDisplayImages', () => {
  it("shows the first image a human chose, by position, ahead of the job's suggestion", () => {
    const rows = [
      bioImage('suggested', { isPrimary: true }),
      bioImage('second', { displayOrder: 1 }),
      bioImage('first', { displayOrder: 0 }),
    ];

    expect(ids(cardDisplayImages(rows))).toEqual(['first']);
  });

  it('shows the first suggested image that has alt text while nothing is chosen', () => {
    const rows = [
      bioImage('bare', { isPrimary: true, alt: null }),
      bioImage('s1', { isPrimary: true }),
      bioImage('s2', { isPrimary: true }),
    ];

    expect(ids(cardDisplayImages(rows))).toEqual(['s1']);
  });

  it('shows no image when no row is chosen or has alt text', () => {
    expect(cardDisplayImages([bioImage('bare', { isPrimary: true, alt: null })])).toEqual([]);
  });

  it("keeps the caller's row, whatever else it carries", () => {
    const row = { ...bioImage('first', { displayOrder: 0 }), licenseUrl: 'https://cc.example' };

    expect(cardDisplayImages([row])[0]).toBe(row);
  });
});

describe('buildLatestRelease', () => {
  it('is the newest listed release the artist holds a direct credit on', () => {
    const latest = buildLatestRelease(ARTIST_ID, [
      releaseRow('old', { releasedOn: '2020-01-01' }),
      releaseRow('new', { releasedOn: '2024-09-01' }),
      releaseRow('draft', { releasedOn: '2030-01-01', publishedAt: null }),
    ]);

    expect(latest?.id).toBe('new');
  });

  it('names no album artist on a release of their own', () => {
    const latest = buildLatestRelease(ARTIST_ID, [releaseRow('own')]);

    expect(latest).toEqual({
      id: 'own',
      title: 'Release own',
      releasedOn: new Date('2024-01-01'),
      playSrc: expect.stringContaining('releases/own/tracks/01.mp3'),
      byName: null,
      albumArtistSlug: null,
    });
  });

  it('is "by" a public album artist when the artist is only featured', () => {
    const ceschi = creditArtist('ceschi', { displayName: 'Ceschi' });

    const latest = buildLatestRelease(ARTIST_ID, [
      releaseRow('guest', { credits: [ceschi, SELF] }),
    ]);

    expect({ byName: latest?.byName, albumArtistSlug: latest?.albumArtistSlug }).toEqual({
      byName: 'Ceschi',
      albumArtistSlug: 'ceschi',
    });
  });

  it('leaves the byline and its slug empty when the album artist is hidden', () => {
    const hidden = creditArtist('hidden', { displayName: 'Hidden', publishedOn: null });

    const latest = buildLatestRelease(ARTIST_ID, [
      releaseRow('guest', { credits: [hidden, SELF] }),
    ]);

    expect({ byName: latest?.byName, albumArtistSlug: latest?.albumArtistSlug }).toEqual({
      byName: null,
      albumArtistSlug: null,
    });
  });

  it('has nothing to play when the release holds no MP3 track', () => {
    const latest = buildLatestRelease(ARTIST_ID, [releaseRow('silent', { mp3: false })]);

    expect(latest?.playSrc).toBeNull();
  });

  it('is null when no direct release is listed', () => {
    expect(buildLatestRelease(ARTIST_ID, [releaseRow('draft', { publishedAt: null })])).toBeNull();
  });
});

describe('buildArtistPageModel', () => {
  describe('display images', () => {
    it('carries every image a human chose, in position order, with no cap', () => {
      const model = buildArtistPageModel(
        pageSource({
          bioImages: [
            bioImage('suggested', { isPrimary: true }),
            bioImage('d4', { displayOrder: 3 }),
            bioImage('d2', { displayOrder: 1 }),
            bioImage('d1', { displayOrder: 0 }),
            bioImage('d3', { displayOrder: 2 }),
          ],
        })
      );

      expect(ids(model.displayImages)).toEqual(['d1', 'd2', 'd3', 'd4']);
    });

    it('falls back to three suggested images with alt text when nothing is chosen', () => {
      const model = buildArtistPageModel(
        pageSource({
          bioImages: [
            bioImage('pool'),
            bioImage('bare', { isPrimary: true, alt: null }),
            bioImage('s1', { isPrimary: true }),
            bioImage('s2', { isPrimary: true }),
            bioImage('s3', { isPrimary: true }),
            bioImage('s4', { isPrimary: true }),
          ],
        })
      );

      expect(ids(model.displayImages)).toEqual(['s1', 's2', 's3']);
    });

    it('falls back to the first three pool images with alt text when nothing is suggested', () => {
      const model = buildArtistPageModel(
        pageSource({
          bioImages: [
            bioImage('bare', { alt: null }),
            bioImage('p1'),
            bioImage('p2'),
            bioImage('p3'),
            bioImage('p4'),
          ],
        })
      );

      expect(ids(model.displayImages)).toEqual(['p1', 'p2', 'p3']);
    });

    it('carries each display image with only the fields the collage renders', () => {
      const pooled = {
        ...bioImage('first', { displayOrder: 0 }),
        originalUrl: 'https://upload.example/original.jpg',
        hasFace: true,
        faceScore: 97.4,
        contentHash: 'content-hash',
        perceptualHash: 'perceptual-hash',
      };

      const [image] = buildArtistPageModel(pageSource({ bioImages: [pooled] })).displayImages;

      expect(Object.keys(image).sort()).toEqual([
        'alt',
        'attribution',
        'height',
        'id',
        'license',
        'sourceUrl',
        'thumbnailUrl',
        'title',
        'url',
        'width',
      ]);
    });
  });

  describe('latest release', () => {
    it('leads with the newest direct release, never a newer band release', () => {
      const model = buildArtistPageModel(
        pageSource({
          releases: [
            releaseRow('own', { releasedOn: '2010-01-01' }),
            releaseRow('guest', {
              credits: [creditArtist('host'), SELF],
              releasedOn: '2024-01-01',
            }),
          ],
          memberOf: [
            band('band', [
              releaseRow('band-lp', { credits: [creditArtist('band')], releasedOn: '2025-01-01' }),
            ]),
          ],
        })
      );

      expect(model.latestRelease?.id).toBe('guest');
    });

    it('is "by" its public album artist when the artist is only featured', () => {
      const model = buildArtistPageModel(
        pageSource({
          releases: [
            releaseRow('guest', {
              credits: [creditArtist('ceschi', { displayName: 'Ceschi' }), SELF],
            }),
          ],
        })
      );

      expect(model.latestRelease?.byName).toBe('Ceschi');
    });

    it('names no one when the album artist is hidden', () => {
      const hidden = creditArtist('hidden', { displayName: 'Hidden', publishedOn: null });

      const model = buildArtistPageModel(
        pageSource({ releases: [releaseRow('guest', { credits: [hidden, SELF] })] })
      );

      expect(model.latestRelease?.byName).toBeNull();
    });
  });

  describe('listed releases', () => {
    it('has none, and no latest release, when no release is listed', () => {
      const model = buildArtistPageModel(
        pageSource({ releases: [releaseRow('draft', { publishedAt: null })] })
      );

      expect({ latest: model.latestRelease, any: model.hasListedRelease }).toEqual({
        latest: null,
        any: false,
      });
    });

    it('counts a public band’s release, which never leads the page', () => {
      const model = buildArtistPageModel(
        pageSource({
          memberOf: [band('band', [releaseRow('band-lp', { credits: [creditArtist('band')] })])],
        })
      );

      expect({ latest: model.latestRelease, any: model.hasListedRelease }).toEqual({
        latest: null,
        any: true,
      });
    });

    it('does not count a hidden band’s release', () => {
      const model = buildArtistPageModel(
        pageSource({
          memberOf: [
            band('band', [releaseRow('band-lp', { credits: [creditArtist('band')] })], {
              publishedOn: null,
            }),
          ],
        })
      );

      expect(model.hasListedRelease).toBe(false);
    });

    it('does not count an unlisted band release', () => {
      const model = buildArtistPageModel(
        pageSource({
          memberOf: [
            band('band', [
              releaseRow('band-draft', { credits: [creditArtist('band')], publishedAt: null }),
            ]),
          ],
        })
      );

      expect(model.hasListedRelease).toBe(false);
    });
  });

  describe('the artist', () => {
    it('sanitizes the bio and the short bio', () => {
      const model = buildArtistPageModel(
        pageSource({
          bio: '<p>Hi</p><script>alert(1)</script>',
          shortBio: '<p><strong>Bold</strong></p><script>alert(2)</script>',
        })
      );

      expect({ bio: model.bio, shortBio: model.shortBio }).toEqual({
        bio: '<p>Hi</p>',
        shortBio: '<p><strong>Bold</strong></p>',
      });
    });

    it('leaves a missing bio and short bio null', () => {
      const model = buildArtistPageModel(pageSource({ bio: null, shortBio: null }));

      expect({ bio: model.bio, shortBio: model.shortBio }).toEqual({ bio: null, shortBio: null });
    });

    it('carries the page scalars and the three derived parts, and nothing else of the read', () => {
      const read = {
        ...pageSource(),
        altBio: '<p>Alt.</p>',
        tags: 'admin-only',
        publishedOn: PUBLISHED,
        labels: [{ id: 'al1', artistId: ARTIST_ID, labelId: 'l1' }],
      };

      expect(Object.keys(buildArtistPageModel(read)).sort()).toEqual([
        'bio',
        'displayImages',
        'displayName',
        'firstName',
        'genres',
        'hasListedRelease',
        'latestRelease',
        'links',
        'middleName',
        'shortBio',
        'slug',
        'suffix',
        'surname',
        'title',
      ]);
    });
  });
});
