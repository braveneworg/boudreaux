/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';
import {
  artistPrivateValues,
  artistWithPublishedReleases,
} from '@/lib/validation/media/schema-fixtures';

import { getPublicArtist } from './get-public-artist';

vi.mock('server-only', () => ({}));

const getArtistBySlugWithReleases = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistBySlugWithReleases: (...args: unknown[]) => getArtistBySlugWithReleases(...args),
  },
}));

describe('getPublicArtist', () => {
  it('reads the artist graph through the service and parses it to the public wire shape', async () => {
    getArtistBySlugWithReleases.mockResolvedValueOnce({
      success: true,
      data: { ...artistWithPublishedReleases, ...artistPrivateValues },
    });

    const artist = await getPublicArtist('marguerite-ash');

    expect(getArtistBySlugWithReleases).toHaveBeenCalledWith('marguerite-ash');
    expect(artist?.slug).toBe(artistWithPublishedReleases.slug);
    for (const field of ARTIST_PRIVATE_FIELDS) {
      expect(artist).not.toHaveProperty(field);
    }
  });

  it('is null when the service finds no public artist', async () => {
    getArtistBySlugWithReleases.mockResolvedValueOnce({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    expect(await getPublicArtist('nobody')).toBeNull();
  });
});
