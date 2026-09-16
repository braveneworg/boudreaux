/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  collectArtistReleases,
  compareByCreditThenNewest,
  deriveOwnReleaseCredit,
  isListable,
  summarizeListedReleases,
} from './artist-release-credits';

import type { CreditableRelease } from './artist-release-credits';

const ARTIST_ID = 'artist-1';
const BAND_ID = 'band-1';
const OTHER_ID = 'artist-2';

interface ReleaseInput {
  id: string;
  releasedOn?: Date | string | null;
  publishedAt?: Date | null;
  deletedOn?: Date | null;
  artistIds?: string[];
}

/** Build a minimal release graph row; defaults to a published, live release credited to the artist alone. */
const release = ({
  id,
  releasedOn = new Date('2024-01-01'),
  publishedAt = new Date('2024-01-01'),
  deletedOn = null,
  artistIds = [ARTIST_ID],
}: ReleaseInput): CreditableRelease => ({
  id,
  releasedOn,
  publishedAt,
  deletedOn,
  artistReleases: artistIds.map((artistId) => ({ artistId })),
});

/** Wrap a release as an `ArtistRelease` join row owned by `artistId`. */
const join = (artistId: string, rel: CreditableRelease) => ({
  id: `${artistId}-${rel.id}`,
  artistId,
  releaseId: rel.id,
  release: rel,
});

describe('deriveOwnReleaseCredit', () => {
  it('is primary when the artist is the first credited artist', () => {
    const rel = release({ id: 'r1', artistIds: [ARTIST_ID, OTHER_ID] });

    expect(deriveOwnReleaseCredit(ARTIST_ID, rel)).toBe('primary');
  });

  it('is featured when the artist is credited but not first', () => {
    const rel = release({ id: 'r1', artistIds: [OTHER_ID, ARTIST_ID] });

    expect(deriveOwnReleaseCredit(ARTIST_ID, rel)).toBe('featured');
  });

  it('is primary when the release carries no artist credits at all', () => {
    const rel = release({ id: 'r1', artistIds: [] });

    expect(deriveOwnReleaseCredit(ARTIST_ID, rel)).toBe('primary');
  });
});

describe('compareByCreditThenNewest', () => {
  it('orders primary before featured before member regardless of date', () => {
    const rows = [
      { credit: 'member' as const, release: { releasedOn: new Date('2025-01-01') } },
      { credit: 'featured' as const, release: { releasedOn: new Date('2024-01-01') } },
      { credit: 'primary' as const, release: { releasedOn: new Date('2020-01-01') } },
    ];

    const ordered = [...rows].sort(compareByCreditThenNewest).map((row) => row.credit);

    expect(ordered).toEqual(['primary', 'featured', 'member']);
  });

  it('orders newest first within the same credit', () => {
    const rows = [
      { credit: 'primary' as const, release: { releasedOn: '2020-01-01' } },
      { credit: 'primary' as const, release: { releasedOn: '2023-01-01' } },
    ];

    const ordered = [...rows].sort(compareByCreditThenNewest).map((row) => row.release.releasedOn);

    expect(ordered).toEqual(['2023-01-01', '2020-01-01']);
  });

  it('sorts a missing release date after dated releases of the same credit', () => {
    const rows = [
      { credit: 'primary' as const, release: { releasedOn: null } },
      { credit: 'primary' as const, release: { releasedOn: new Date('2001-01-01') } },
    ];

    const ordered = [...rows].sort(compareByCreditThenNewest).map((row) => row.release.releasedOn);

    expect(ordered).toEqual([new Date('2001-01-01'), null]);
  });
});

describe('collectArtistReleases', () => {
  it('tags directly linked releases as primary or featured', () => {
    const own = release({ id: 'own', artistIds: [ARTIST_ID] });
    const guest = release({ id: 'guest', artistIds: [OTHER_ID, ARTIST_ID] });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [join(ARTIST_ID, guest), join(ARTIST_ID, own)],
      memberOf: [],
    });

    expect(result.map(({ releaseId, credit }) => ({ releaseId, credit }))).toEqual([
      { releaseId: 'own', credit: 'primary' },
      { releaseId: 'guest', credit: 'featured' },
    ]);
  });

  it('appends the releases of every band the artist belongs to as member credits', () => {
    const bandRelease = release({ id: 'band-lp', artistIds: [BAND_ID] });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [],
      memberOf: [{ artist: { releases: [join(BAND_ID, bandRelease)] } }],
    });

    expect(result).toEqual([{ ...join(BAND_ID, bandRelease), credit: 'member' }]);
  });

  it('orders the artist’s own releases before featured and band appearances', () => {
    const oldOwn = release({ id: 'old-own', releasedOn: new Date('2010-01-01') });
    const newGuest = release({
      id: 'new-guest',
      releasedOn: new Date('2024-01-01'),
      artistIds: [OTHER_ID, ARTIST_ID],
    });
    const newBand = release({
      id: 'new-band',
      releasedOn: new Date('2025-01-01'),
      artistIds: [BAND_ID],
    });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [join(ARTIST_ID, newGuest), join(ARTIST_ID, oldOwn)],
      memberOf: [{ artist: { releases: [join(BAND_ID, newBand)] } }],
    });

    expect(result.map(({ releaseId }) => releaseId)).toEqual(['old-own', 'new-guest', 'new-band']);
  });

  it('keeps the direct credit when a release is reachable both directly and through a band', () => {
    const shared = release({ id: 'shared', artistIds: [ARTIST_ID, BAND_ID] });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [join(ARTIST_ID, shared)],
      memberOf: [{ artist: { releases: [join(BAND_ID, shared)] } }],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ artistId: ARTIST_ID, credit: 'primary' });
  });

  it('drops a release that two bands share so it is listed once', () => {
    const shared = release({ id: 'shared', artistIds: [BAND_ID, 'band-2'] });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [],
      memberOf: [
        { artist: { releases: [join(BAND_ID, shared)] } },
        { artist: { releases: [join('band-2', shared)] } },
      ],
    });

    expect(result).toHaveLength(1);
  });

  it('excludes unpublished and deleted releases from every source', () => {
    const unpublishedOwn = release({ id: 'unpublished-own', publishedAt: null });
    const deletedOwn = release({ id: 'deleted-own', deletedOn: new Date('2024-06-01') });
    const unpublishedBand = release({
      id: 'unpublished-band',
      publishedAt: null,
      artistIds: [BAND_ID],
    });
    const liveBand = release({ id: 'live-band', artistIds: [BAND_ID] });

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [join(ARTIST_ID, unpublishedOwn), join(ARTIST_ID, deletedOwn)],
      memberOf: [
        { artist: { releases: [join(BAND_ID, unpublishedBand), join(BAND_ID, liveBand)] } },
      ],
    });

    expect(result.map(({ releaseId }) => releaseId)).toEqual(['live-band']);
  });

  it('treats a missing publishedAt field (legacy Mongo document) as unpublished', () => {
    const legacy = { ...release({ id: 'legacy' }), publishedAt: undefined };

    const result = collectArtistReleases({
      id: ARTIST_ID,
      releases: [join(ARTIST_ID, legacy)],
      memberOf: [],
    });

    expect(result).toEqual([]);
  });
});

describe('isListable', () => {
  it('lists a published, non-deleted release', () => {
    expect(isListable({ publishedAt: new Date('2024-01-01'), deletedOn: null })).toBe(true);
  });

  it('hides an unpublished release', () => {
    expect(isListable({ publishedAt: null, deletedOn: null })).toBe(false);
  });

  it('hides a deleted release even when published', () => {
    expect(
      isListable({ publishedAt: new Date('2024-01-01'), deletedOn: new Date('2024-02-01') })
    ).toBe(false);
  });

  it('treats a missing publishedAt field (legacy Mongo document) as unpublished', () => {
    expect(isListable({ deletedOn: null })).toBe(false);
  });
});

describe('summarizeListedReleases', () => {
  const listedRow = (id: string, title: string, releasedOn: Date | string) => ({
    release: { id, title, releasedOn, publishedAt: new Date('2024-01-01'), deletedOn: null },
  });

  it('counts only published, non-deleted releases', () => {
    const rows = [
      listedRow('a', 'A', new Date('2020-01-01')),
      { release: { id: 'b', title: 'B', releasedOn: new Date('2025-01-01'), publishedAt: null } },
      {
        release: {
          id: 'c',
          title: 'C',
          releasedOn: new Date('2026-01-01'),
          publishedAt: new Date('2024-01-01'),
          deletedOn: new Date('2024-02-01'),
        },
      },
    ];

    expect(summarizeListedReleases(rows).releaseCount).toBe(1);
  });

  it('picks the newest listed release by release date', () => {
    const rows = [
      listedRow('old', 'Old', new Date('2020-01-01')),
      listedRow('new', 'New', new Date('2024-09-01')),
      listedRow('mid', 'Mid', new Date('2022-01-01')),
    ];

    expect(summarizeListedReleases(rows).newestRelease).toEqual({
      id: 'new',
      title: 'New',
      releasedOn: new Date('2024-09-01'),
    });
  });

  it('never picks an unlisted release as the newest, even when it is the latest', () => {
    const rows = [
      listedRow('listed', 'Listed', new Date('2020-01-01')),
      {
        release: {
          id: 'draft',
          title: 'Draft',
          releasedOn: new Date('2026-01-01'),
          publishedAt: null,
        },
      },
    ];

    expect(summarizeListedReleases(rows).newestRelease?.id).toBe('listed');
  });

  it('returns a zero count and no newest release when nothing is listed', () => {
    expect(summarizeListedReleases([])).toEqual({ releaseCount: 0, newestRelease: null });
  });

  it('rebuilds a string release date as a Date on the newest release', () => {
    const rows = [listedRow('s', 'S', '2023-05-05T00:00:00.000Z')];

    expect(summarizeListedReleases(rows).newestRelease?.releasedOn).toEqual(
      new Date('2023-05-05T00:00:00.000Z')
    );
  });
});
