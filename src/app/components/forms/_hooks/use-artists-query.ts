/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQueries } from '@tanstack/react-query';

import type { QueryOptionsOverride } from '@/hooks/query-options';
import { queryKeys } from '@/lib/query-keys';

import { type ArtistDetail, fetchArtistById } from './use-artist-query';

/**
 * React Query hook for batch-fetching several artists by id in parallel.
 *
 * Spins up one `useQuery` per id via {@link useQueries}, each reusing the same
 * {@link fetchArtistById} helper and stable per-artist query key as
 * `useArtistQuery`, so a single artist's cache entry is shared between the two
 * hooks. Intended for callers that need a handful of artists at once (e.g.
 * labeling image options with their owning artist's name) without chaining
 * dependent single-artist hooks.
 *
 * @param artistIds - The artist identifiers to fetch; each empty id is gated off.
 * @param options - Caller overrides spread into every per-artist `useQuery`
 * call (e.g. `staleTime`); the non-empty-id gate is always applied on top.
 * @returns `artistsById`, a record mapping each requested id to its parsed
 * artist (`null` when not found, `undefined` while still loading), and
 * `isPending`, true while any of the per-artist queries is still pending.
 */
export const useArtistsQuery = (
  artistIds: string[],
  options: QueryOptionsOverride<ArtistDetail | null> = {}
): {
  artistsById: Record<string, ArtistDetail | null | undefined>;
  isPending: boolean;
} => {
  const results = useQueries({
    queries: artistIds.map((id) => ({
      queryKey: queryKeys.artists.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchArtistById(id, signal),
      ...options,
      enabled: (options.enabled ?? true) && !!id,
    })),
  });

  const artistsById: Record<string, ArtistDetail | null | undefined> = Object.fromEntries(
    artistIds.map((id, index) => [id, results.at(index)?.data])
  );

  const isPending = results.some((result) => result.isPending);

  return { artistsById, isPending };
};
