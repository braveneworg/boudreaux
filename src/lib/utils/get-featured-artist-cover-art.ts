/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FeaturedArtist } from '@/lib/types/media-models';

/**
 * Resolve the cover-art URL for a featured artist, applying the same fallback
 * chain used by `featured-artists-player`:
 *   1. `featured.coverArt`
 *   2. `featured.release.coverArt`
 *   3. First `featured.release.images[].src`
 *   4. Primary `featured.artists[].bioImages[].url`
 *   5. null
 */
const releaseCoverArt = (featured: FeaturedArtist): string | null => {
  if (featured.release?.coverArt) {
    return featured.release.coverArt;
  }
  if (featured.release?.images?.length && featured.release.images[0].src) {
    return featured.release.images[0].src;
  }
  return null;
};

const firstArtistImageUrl = (featured: FeaturedArtist): string | null => {
  if (!featured.artists?.length) {
    return null;
  }
  for (const artist of featured.artists) {
    if (artist.bioImages?.length && artist.bioImages[0].url) {
      return artist.bioImages[0].url;
    }
  }
  return null;
};

export const getFeaturedArtistCoverArt = (featured: FeaturedArtist): string | null => {
  if (featured.coverArt) {
    return featured.coverArt;
  }
  return releaseCoverArt(featured) ?? firstArtistImageUrl(featured);
};
