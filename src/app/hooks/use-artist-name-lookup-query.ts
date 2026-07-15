/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';

import { queryKeys } from '@/lib/query-keys';

import { fetchAndParse } from './fetch-and-parse';

import type { QueryOptionsOverride } from './query-options';

// ── Response schema ───────────────────────────────────────────────────────────

const artistMatchSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  firstName: z.string(),
  surname: z.string(),
});

const artistNameLookupResponseSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      match: artistMatchSchema.nullable(),
    })
  ),
});

/** Parsed response from `GET /api/artists/name-lookup`. */
export type ArtistNameLookupResponse = z.infer<typeof artistNameLookupResponseSchema>;

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Build the URL for the name-lookup route from an array of artist name strings. */
const buildLookupUrl = (names: string[]): string => {
  const params = new URLSearchParams();
  for (const name of names) {
    params.append('name', name);
  }
  return `/api/artists/name-lookup?${params.toString()}`;
};

/**
 * React Query hook for looking up existing artists by name against the admin
 * name-lookup route. This is the **only** access path to
 * `GET /api/artists/name-lookup`; never call that route directly from a
 * component.
 *
 * For each name in the array the route returns the matched artist record (with
 * `id`, `displayName`, `firstName`, `surname`) or `null` when no artist
 * matches. Order is preserved relative to the input names.
 *
 * The query is disabled when `names` is empty, or when `options.enabled` is
 * `false`. `staleTime` is `60_000` ms (1 minute) — a matching shell created
 * moments ago will still be fresh enough. `retry` is `false` because a lookup
 * failure in the artist-review UI is silently skipped rather than retried.
 *
 * @param names - Artist name strings to look up; disables the query when empty.
 * @param options - Caller overrides spread into `useQuery` (e.g. `enabled`);
 * `queryKey` and `queryFn` stay locked.
 * @returns The TanStack Query result containing the `results` array.
 */
export const useArtistNameLookupQuery = (
  names: string[],
  options: QueryOptionsOverride<ArtistNameLookupResponse> = {}
): UseQueryResult<ArtistNameLookupResponse> =>
  useQuery({
    queryKey: queryKeys.artists.nameLookup(names),
    queryFn: ({ signal }) =>
      fetchAndParse(buildLookupUrl(names), artistNameLookupResponseSchema, {
        signal,
        errorMessage: 'Failed to fetch artist name lookup',
      }),
    staleTime: 60_000,
    retry: false,
    ...options,
    enabled: (options.enabled ?? true) && names.length > 0,
  });
