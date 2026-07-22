/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { featuredArtistSchema } from './featured-artist-schema';
import { featuredArtist } from './schema-fixtures';

describe('featuredArtistSchema', () => {
  it('parses a featured artist with a digital format and release', () => {
    expect(() => featuredArtistSchema.parse(featuredArtist)).not.toThrow();
  });

  it('parses a featured artist with null digital format and release', () => {
    expect(() =>
      featuredArtistSchema.parse({ ...featuredArtist, digitalFormat: null, release: null })
    ).not.toThrow();
  });
});
