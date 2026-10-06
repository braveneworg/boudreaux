/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { cache } from 'react';

import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { artistWithPublishedReleasesSchema } from '@/lib/validation/media/artist-schema';

/**
 * The public artist graph for a slug, or `null` when there is no public
 * artist there. Read through the service (no self-HTTP) and parsed through
 * the public wire schema, so nothing private reaches the page; memoised
 * per request with React's `cache`, so `generateMetadata` and the page
 * share one read.
 */
export const getPublicArtist = cache(
  async (slug: string): Promise<ArtistWithPublishedReleases | null> => {
    const result = await ArtistService.getArtistBySlugWithReleases(slug);
    if (!result.success) return null;
    return artistWithPublishedReleasesSchema.parse(result.data);
  }
);
