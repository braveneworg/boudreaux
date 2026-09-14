/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistSchema, artistWithPublishedReleasesSchema } from './artist-schema';
import { artist, artistWithPublishedReleases } from './schema-fixtures';

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
});
