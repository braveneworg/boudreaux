/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';

import { artistListItemSchema, artistPageModelSchema, artistSchema } from './artist-schema';
import { artist, artistPageModel, artistPrivateValues, artistScalar } from './schema-fixtures';

describe('artistSchema', () => {
  it('parses an artist with all relations', () => {
    expect(() => artistSchema.parse(artist)).not.toThrow();
  });

  it('rejects an artist missing a required scalar', () => {
    const { surname: _omit, ...invalid } = artist;
    expect(() => artistSchema.parse(invalid)).toThrow();
  });
});

// ADR-0019: the admin listing says whether a display image is chosen.
describe('artistListItemSchema', () => {
  it('parses a listing row with its display-image flag', () => {
    expect(artistListItemSchema.parse({ ...artist, hasDisplayImage: false })).toMatchObject({
      hasDisplayImage: false,
    });
  });

  it('rejects a listing row without the flag', () => {
    expect(() => artistListItemSchema.parse(artist)).toThrow();
  });
});

describe('artistPageModelSchema', () => {
  it('parses the page model, rebuilding the latest release date', () => {
    const parsed = artistPageModelSchema.parse(artistPageModel);

    expect(parsed.latestRelease?.releasedOn).toEqual(
      new Date(artistPageModel.latestRelease.releasedOn)
    );
  });

  it("keeps the album artist's name and slug on the latest release", () => {
    const { latestRelease } = artistPageModelSchema.parse(artistPageModel);

    expect({ byName: latestRelease?.byName, slug: latestRelease?.albumArtistSlug }).toEqual({
      byName: 'Ceschi',
      slug: 'ceschi',
    });
  });

  it('accepts a model with no latest release', () => {
    const parsed = artistPageModelSchema.parse({ ...artistPageModel, latestRelease: null });

    expect(parsed.latestRelease).toBeNull();
  });

  it('rejects a model that does not say whether any listed release exists', () => {
    const { hasListedRelease: _omit, ...invalid } = artistPageModel;

    expect(artistPageModelSchema.safeParse(invalid).success).toBe(false);
  });

  // Zod strips unknown keys, so the schema is the response guard (#765): a
  // field a future read lets through is dropped before the page renders it.
  it.each(ARTIST_PRIVATE_FIELDS)('strips the private field %s', (field) => {
    const parsed = artistPageModelSchema.parse({ ...artistPageModel, ...artistPrivateValues });

    expect(parsed).not.toHaveProperty(field);
  });

  it('carries only the page scalars and the three derived parts', () => {
    const parsed = artistPageModelSchema.parse({
      ...artistScalar,
      ...artistPageModel,
      labels: [{ id: 'al1', artistId: 'a1', labelId: 'l1' }],
      releases: [],
      members: [],
    });

    expect(Object.keys(parsed).sort()).toEqual([
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

  it('strips the pool internals from a display image', () => {
    const [image] = artistPageModel.displayImages;
    const parsed = artistPageModelSchema.parse({
      ...artistPageModel,
      displayImages: [
        {
          ...image,
          artistId: 'a1',
          originalUrl: 'https://upload.example/original.jpg',
          hasFace: true,
          faceScore: 97.4,
          contentHash: 'sha-a',
          perceptualHash: '0000000000000abc',
          isPrimary: true,
          displayOrder: 0,
          sortOrder: 0,
        },
      ],
    });

    expect(Object.keys(parsed.displayImages[0]).sort()).toEqual(Object.keys(image).sort());
  });
});
