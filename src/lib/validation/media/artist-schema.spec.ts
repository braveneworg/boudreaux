/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';

import { artistSchema, artistWithPublishedReleasesSchema } from './artist-schema';
import {
  artist,
  artistPrivateValues,
  artistPublicScalar,
  artistScalar,
  artistWithPublishedReleases,
  release,
} from './schema-fixtures';

describe('artistSchema', () => {
  it('parses an artist with all relations', () => {
    expect(() => artistSchema.parse(artist)).not.toThrow();
  });

  it('rejects an artist missing a required scalar', () => {
    const { surname: _omit, ...invalid } = artist;
    expect(() => artistSchema.parse(invalid)).toThrow();
  });
});

describe('artistWithPublishedReleasesSchema', () => {
  it('parses an artist-with-releases payload including the members relation', () => {
    expect(() =>
      artistWithPublishedReleasesSchema.parse(artistWithPublishedReleases)
    ).not.toThrow();
  });

  // Guards the regression where the route's Prisma include omitted `members`
  // while the schema required it, failing client-side validation on every visit.
  it('rejects a payload missing the members relation', () => {
    const { members: _omit, ...invalid } = artistWithPublishedReleases;
    expect(() => artistWithPublishedReleasesSchema.parse(invalid)).toThrow();
  });

  it('accepts every release credit the service can assign', () => {
    const [row] = artistWithPublishedReleases.releases;
    const withCredits = {
      ...artistWithPublishedReleases,
      releases: [
        row,
        { ...row, id: 'ar2', credit: 'featured' },
        { ...row, id: 'ar3', credit: 'member' },
      ],
    };

    expect(() => artistWithPublishedReleasesSchema.parse(withCredits)).not.toThrow();
  });

  it('rejects a release row with an unknown credit', () => {
    const [row] = artistWithPublishedReleases.releases;
    const invalid = { ...artistWithPublishedReleases, releases: [{ ...row, credit: 'guest' }] };

    expect(() => artistWithPublishedReleasesSchema.parse(invalid)).toThrow();
  });

  it('retains the bio image face signal fields through the scalar mirror', () => {
    const parsed = artistWithPublishedReleasesSchema.parse(artistWithPublishedReleases);
    expect(parsed.bioImages[0].hasFace).toBe(true);
    expect(parsed.bioImages[0].faceScore).toBe(97.4);
  });

  it('accepts a null face signal on a bio image row', () => {
    const withNullFace = {
      ...artistWithPublishedReleases,
      bioImages: [{ ...artistWithPublishedReleases.bioImages[0], hasFace: null, faceScore: null }],
    };
    expect(() => artistWithPublishedReleasesSchema.parse(withNullFace)).not.toThrow();
  });

  // A plain z.object strips unknown keys, so a display position the wire
  // carries but the schema does not know would vanish client-side and the
  // page would silently fall back to the suggested images.
  it('retains a human-chosen displayOrder through the scalar mirror', () => {
    const chosen = {
      ...artistWithPublishedReleases,
      bioImages: [{ ...artistWithPublishedReleases.bioImages[0], displayOrder: 2 }],
    };
    const parsed = artistWithPublishedReleasesSchema.parse(chosen);
    expect(parsed.bioImages[0].displayOrder).toBe(2);
  });

  it('accepts a null displayOrder on a bio image row', () => {
    const parsed = artistWithPublishedReleasesSchema.parse(artistWithPublishedReleases);
    expect(parsed.bioImages[0].displayOrder).toBeNull();
  });
});

describe('artistWithPublishedReleasesSchema — public projection (#765)', () => {
  const leakyArtist = { ...artistScalar, ...artistPrivateValues };
  const leakyPayload = {
    ...artistWithPublishedReleases,
    ...artistPrivateValues,
    members: [{ id: 'am1', artistId: 'a1', memberId: 'a2', member: { ...leakyArtist, id: 'a2' } }],
    releases: [
      {
        id: 'ar1',
        artistId: 'a1',
        releaseId: 'r1',
        credit: 'primary' as const,
        release: {
          ...release,
          artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: leakyArtist }],
        },
      },
    ],
  };

  it('parses a payload whose artists carry no private field', () => {
    const publicPayload = {
      ...artistWithPublishedReleases,
      ...artistPublicScalar,
      members: [{ id: 'am1', artistId: 'a1', memberId: 'a2', member: artistPublicScalar }],
      releases: [
        {
          ...leakyPayload.releases[0],
          release: {
            ...release,
            artistReleases: [
              { id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: artistPublicScalar },
            ],
          },
        },
      ],
    };
    for (const field of ARTIST_PRIVATE_FIELDS) {
      Reflect.deleteProperty(publicPayload, field);
    }

    expect(() => artistWithPublishedReleasesSchema.parse(publicPayload)).not.toThrow();
  });

  it.each(ARTIST_PRIVATE_FIELDS)('strips %s from every artist on the graph', (field) => {
    const parsed = artistWithPublishedReleasesSchema.parse(leakyPayload);
    const artists = [
      parsed,
      ...parsed.members.map(({ member }) => member),
      ...parsed.releases.flatMap(({ release: row }) => row.artistReleases.map((ar) => ar.artist)),
    ];

    expect(artists.filter((entry) => field in entry)).toEqual([]);
  });
});
