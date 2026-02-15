/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import type { FeaturedArtist } from '@/lib/types/media-models';

/**
 * Server action to fetch featured artists for the landing page
 * @param limit - Maximum number of featured artists to fetch (default: 7)
 * @returns Array of featured artists or empty array on error
 */
export async function getFeaturedArtistsAction(limit = 7): Promise<FeaturedArtist[]> {
  const result = await FeaturedArtistsService.getFeaturedArtists(new Date(), limit);

  if (!result.success) {
    console.error('Failed to fetch featured artists:', result.error);
    return [];
  }

  return result.data;
}
