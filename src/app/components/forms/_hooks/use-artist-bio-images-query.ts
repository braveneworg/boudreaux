/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQueries } from '@tanstack/react-query';
import { z } from 'zod';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';
import { bioStatusImageSchema, type BioStatusImage } from '@/lib/validation/bio-generation-schema';
import { fetchAndParse } from '@/utils/fetch-and-parse';

/** The wire shape of `GET /api/artists/[id]/bio-images`: the pool in picker order. */
const bioImagePoolSchema = z.array(bioStatusImageSchema);

/**
 * Fetch one artist's bio image pool in picker order (display images first,
 * then suggested, then the rest). A missing artist resolves to an empty pool
 * so a picker over several artists never fails as a whole.
 */
export const fetchArtistBioImages = async (
  artistId: string,
  signal?: AbortSignal
): Promise<BioStatusImage[]> =>
  fetchAndParse(`/api/artists/${encodeURIComponent(artistId)}/bio-images`, bioImagePoolSchema, {
    signal,
    errorMessage: 'Failed to fetch artist bio images',
    fallbackByStatus: { 404: [] },
  });

/**
 * React Query hook for the bio image pools of several artists at once — the
 * data behind the cover-art picker on the release and featured-artist forms.
 *
 * One `useQuery` per artist via {@link useQueries}, each keyed by
 * `queryKeys.artists.bioImages(id)` so the display-image mutations can
 * invalidate a single artist's pool.
 *
 * @param artistIds - The artists whose pools to fetch; each empty id is gated off.
 * @param options - Caller overrides spread into every per-artist query (e.g.
 * `staleTime`); the non-empty-id gate is always applied on top.
 * @returns `imagesByArtistId`, mapping each requested id to its pool
 * (`undefined` while loading), and `isPending`, true while any pool is pending.
 */
export const useArtistBioImagesQuery = (
  artistIds: string[],
  options: QueryOptionsOverride<BioStatusImage[]> = {}
): {
  imagesByArtistId: Record<string, BioStatusImage[] | undefined>;
  isPending: boolean;
} => {
  const results = useQueries({
    queries: artistIds.map((id) => ({
      queryKey: queryKeys.artists.bioImages(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchArtistBioImages(id, signal),
      ...options,
      enabled: (options.enabled ?? true) && !!id,
    })),
  });

  const imagesByArtistId: Record<string, BioStatusImage[] | undefined> = Object.fromEntries(
    artistIds.map((id, index) => [id, results.at(index)?.data])
  );

  const isPending = results.some((result) => result.isPending);

  return { imagesByArtistId, isPending };
};
