/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FeaturedArtist } from '@/lib/types/media-models';

import { getFeaturedArtistDisplayName } from './get-featured-artist-display-name';

describe('getFeaturedArtistDisplayName', () => {
  it('should return displayName when featured has a displayName', () => {
    const featured = {
      displayName: 'DJ Cool',
      artists: [],
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBe('DJ Cool');
  });

  it('should return first artist displayName when featured has no displayName', () => {
    const featured = {
      displayName: null,
      artists: [{ displayName: 'Artist One', firstName: 'John', surname: 'Doe' }],
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBe('Artist One');
  });

  it('should return firstName + surname when artist has no displayName', () => {
    const featured = {
      displayName: null,
      artists: [{ displayName: null, firstName: 'John', surname: 'Doe' }],
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBe('John Doe');
  });

  it('should return null when displayName is null and artists is empty', () => {
    const featured = {
      displayName: null,
      artists: [],
      release: null,
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBeNull();
  });

  it('should return null when artists is undefined', () => {
    const featured = {
      displayName: null,
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBeNull();
  });
});
