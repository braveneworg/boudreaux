/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseCredit } from '@/lib/types/domain/release';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { artistWithPublishedReleases, release } from '@/lib/validation/media/schema-fixtures';

import { toLatestRelease } from './latest-release';

type Row = ArtistWithPublishedReleases['releases'][number];

const row = (
  id: string,
  credit: ReleaseCredit,
  overrides: Partial<Row> = {},
  releaseOverrides: Partial<Row['release']> = {}
): Row =>
  ({
    ...artistWithPublishedReleases.releases[0],
    id: `ar-${id}`,
    releaseId: id,
    credit,
    release: { ...release, id, title: `Release ${id}`, ...releaseOverrides },
    ...overrides,
  }) as Row;

const graph = (overrides: Partial<ArtistWithPublishedReleases>): ArtistWithPublishedReleases =>
  ({ ...artistWithPublishedReleases, ...overrides }) as ArtistWithPublishedReleases;

const releasedOn = new Date('2024-09-30T23:30:00.000Z');

describe('toLatestRelease', () => {
  it('is null when the graph names no newest release', () => {
    expect(toLatestRelease(graph({ newestRelease: null }))).toBeNull();
  });

  it('finds the newest release among the credits and reads its first track', () => {
    const latest = toLatestRelease(
      graph({
        newestRelease: { id: 'new', title: 'Release new', releasedOn },
        releases: [
          row('old', 'primary'),
          row('new', 'primary', {}, {
            digitalFormats: [{ files: [{ s3Key: 'releases/new/tracks/01.mp3' }] }],
          } as never),
        ],
      })
    );

    expect(latest).toEqual({
      id: 'new',
      title: 'Release new',
      releasedOn,
      playSrc: expect.stringContaining('releases/new/tracks/01.mp3'),
      byName: null,
    });
  });

  it('names the album artist when the artist is only featured on it', () => {
    const latest = toLatestRelease(
      graph({
        newestRelease: { id: 'guest', title: 'Release guest', releasedOn },
        releases: [
          row('guest', 'featured', {
            albumArtist: {
              ...artistWithPublishedReleases.members[0].member,
              displayName: 'Ceschi',
            } as unknown as Row['albumArtist'],
          }),
        ],
      })
    );

    expect(latest?.byName).toBe('Ceschi');
  });

  it('leaves the byline empty when the album artist is hidden', () => {
    const latest = toLatestRelease(
      graph({
        newestRelease: { id: 'guest', title: 'Release guest', releasedOn },
        releases: [row('guest', 'featured', { albumArtist: null })],
      })
    );

    expect(latest?.byName).toBeNull();
  });

  it('has no play source when the release holds no MP3 track', () => {
    const latest = toLatestRelease(
      graph({
        newestRelease: { id: 'silent', title: 'Release silent', releasedOn },
        releases: [row('silent', 'primary', {}, { digitalFormats: [] })],
      })
    );

    expect(latest?.playSrc).toBeNull();
  });

  it('falls back to the summary alone when the credit row is missing', () => {
    const latest = toLatestRelease(
      graph({ newestRelease: { id: 'gone', title: 'Release gone', releasedOn }, releases: [] })
    );

    expect(latest).toEqual({
      id: 'gone',
      title: 'Release gone',
      releasedOn,
      playSrc: null,
      byName: null,
    });
  });
});
