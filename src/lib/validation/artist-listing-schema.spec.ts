/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistListingPageSchema, artistListingRowSchema } from './artist-listing-schema';

const wireName = {
  id: 'b-1',
  displayName: 'E2E Band',
  firstName: 'E2E',
  middleName: null,
  surname: 'Band',
  title: null,
  suffix: null,
};

const wireRow = {
  id: 'a-1',
  slug: 'e2e-artist',
  firstName: 'E2E',
  middleName: null,
  surname: 'Artist',
  title: null,
  suffix: null,
  displayName: 'E2E Artist',
  akaNames: null,
  genres: 'Experimental',
  instruments: 'guitar',
  shortBio: 'A short bio.',
  bornOn: '1975-01-01T00:00:00.000Z',
  diedOn: null,
  formedOn: null,
  bioImages: [
    {
      id: 'img-1',
      url: 'https://cdn.example.com/a.jpg',
      thumbnailUrl: null,
      title: 'Portrait',
      attribution: null,
      license: null,
      licenseUrl: null,
      sourceUrl: null,
    },
  ],
  members: [],
  memberOf: [wireName],
  releaseCount: 3,
  newestRelease: { id: 'r-3', title: 'E2E Album Three', releasedOn: '2024-09-01T00:00:00.000Z' },
};

describe('artistListingRowSchema', () => {
  it('parses a wire row, rebuilding ISO date strings into Dates', () => {
    const parsed = artistListingRowSchema.parse(wireRow);

    expect(parsed.bornOn).toEqual(new Date('1975-01-01T00:00:00.000Z'));
    expect(parsed.newestRelease?.releasedOn).toEqual(new Date('2024-09-01T00:00:00.000Z'));
  });

  it('accepts a row with no newest release', () => {
    const parsed = artistListingRowSchema.parse({
      ...wireRow,
      releaseCount: 0,
      newestRelease: null,
    });

    expect(parsed.newestRelease).toBeNull();
  });

  it('rejects a row missing the release count', () => {
    const { releaseCount: _releaseCount, ...withoutCount } = wireRow;

    expect(artistListingRowSchema.safeParse(withoutCount).success).toBe(false);
  });

  it('strips unknown keys so contact fields can never reach the client shape', () => {
    const parsed = artistListingRowSchema.parse({ ...wireRow, email: 'x@example.com' });

    expect(parsed).not.toHaveProperty('email');
  });
});

describe('artistListingPageSchema', () => {
  it('parses a page envelope with rows and a nullable nextSkip', () => {
    const parsed = artistListingPageSchema.parse({ rows: [wireRow], nextSkip: null });

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.nextSkip).toBeNull();
  });

  it('rejects a page whose nextSkip is missing', () => {
    expect(artistListingPageSchema.safeParse({ rows: [] }).success).toBe(false);
  });
});
