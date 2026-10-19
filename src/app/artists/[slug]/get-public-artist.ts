/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { cache } from 'react';

import { ArtistService } from '@/lib/services/artist-service';
import type { ArtistPageModel } from '@/lib/types/domain/artist';
import { artistPageModelSchema } from '@/lib/validation/media/artist-schema';

/**
 * The artist page model for a slug, or `null` when there is no public artist
 * there. Read through the service (no self-HTTP) and parsed through the page
 * model schema, which strips every key it does not name, so nothing private
 * and no pool internal reaches the page; memoised per request with React's
 * `cache`, so `generateMetadata`, the page and the artist-filtered listings
 * share one read.
 */
export const getPublicArtist = cache(async (slug: string): Promise<ArtistPageModel | null> => {
  const result = await ArtistService.getArtistBySlugWithReleases(slug);
  if (!result.success) return null;
  return artistPageModelSchema.parse(result.data);
});
