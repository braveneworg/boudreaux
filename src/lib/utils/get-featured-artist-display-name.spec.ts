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

  it('should fall back to release artistReleases when no artists array', () => {
    const featured = {
      displayName: null,
      artists: [],
      release: {
        artistReleases: [
          {
            artist: { displayName: 'Release Artist', firstName: 'Jane', surname: 'Smith' },
          },
        ],
      },
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBe('Release Artist');
  });

  it('should return firstName + surname from release artist when displayName is null', () => {
    const featured = {
      displayName: null,
      artists: [],
      release: {
        artistReleases: [
          {
            artist: { displayName: null, firstName: 'Jane', surname: 'Smith' },
          },
        ],
      },
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBe('Jane Smith');
  });

  it('should return null when no name can be resolved', () => {
    const featured = {
      displayName: null,
      artists: [],
      release: { artistReleases: [] },
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBeNull();
  });

  it('should return null when release is null', () => {
    const featured = {
      displayName: null,
      artists: [],
      release: null,
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBeNull();
  });

  it('should return null when artists is undefined and release has no artistReleases', () => {
    const featured = {
      displayName: null,
      release: { artistReleases: [] },
    } as unknown as FeaturedArtist;

    expect(getFeaturedArtistDisplayName(featured)).toBeNull();
  });
});
