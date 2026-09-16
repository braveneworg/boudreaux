/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ARTIST_LISTING_DEFAULT_TAKE,
  ARTIST_LISTING_MAX_SEARCH_LENGTH,
  ARTIST_LISTING_MAX_TAKE,
  artistListingQuerySchema,
} from './artist-listing-query-schema';

describe('artistListingQuerySchema', () => {
  it('fills every default when no params are given', () => {
    expect(artistListingQuerySchema.parse({})).toEqual({
      sort: 'alpha',
      skip: 0,
      take: ARTIST_LISTING_DEFAULT_TAKE,
    });
  });

  it('trims the search term', () => {
    expect(artistListingQuerySchema.parse({ search: '  punk  ' }).search).toBe('punk');
  });

  it('drops a blank search term', () => {
    expect(artistListingQuerySchema.parse({ search: '   ' })).not.toHaveProperty('search');
  });

  it('truncates an over-long search term instead of rejecting it', () => {
    const long = 'x'.repeat(ARTIST_LISTING_MAX_SEARCH_LENGTH + 40);

    expect(artistListingQuerySchema.parse({ search: long }).search).toHaveLength(
      ARTIST_LISTING_MAX_SEARCH_LENGTH
    );
  });

  it('accepts the newest sort', () => {
    expect(artistListingQuerySchema.parse({ sort: 'newest' }).sort).toBe('newest');
  });

  it('falls back to the A–Z sort for an unknown value', () => {
    expect(artistListingQuerySchema.parse({ sort: 'sideways' }).sort).toBe('alpha');
  });

  it('coerces numeric strings for skip and take', () => {
    expect(artistListingQuerySchema.parse({ skip: '48', take: '12' })).toMatchObject({
      skip: 48,
      take: 12,
    });
  });

  it('clamps a negative skip to 0', () => {
    expect(artistListingQuerySchema.parse({ skip: '-5' }).skip).toBe(0);
  });

  it('falls back to skip 0 for a non-numeric value', () => {
    expect(artistListingQuerySchema.parse({ skip: 'nope' }).skip).toBe(0);
  });

  it('clamps an oversized take to the maximum', () => {
    expect(artistListingQuerySchema.parse({ take: '500' }).take).toBe(ARTIST_LISTING_MAX_TAKE);
  });

  it('clamps a zero take up to 1', () => {
    expect(artistListingQuerySchema.parse({ take: '0' }).take).toBe(1);
  });

  it('falls back to the default take for a non-numeric value', () => {
    expect(artistListingQuerySchema.parse({ take: 'nope' }).take).toBe(ARTIST_LISTING_DEFAULT_TAKE);
  });

  it('truncates a fractional skip to a whole offset', () => {
    expect(artistListingQuerySchema.parse({ skip: '2.9' }).skip).toBe(2);
  });
});
