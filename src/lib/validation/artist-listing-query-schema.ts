/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import type {
  ArtistListingFilters,
  ArtistListingRoster,
  ArtistListingSort,
} from '@/lib/types/domain/artist';

/** Page size the index requests and the SSR prefetch reads (kept in sync with the hook). */
export const ARTIST_LISTING_DEFAULT_TAKE = 24;
/** Upper bound on one page — matches the admin listing's cap. */
export const ARTIST_LISTING_MAX_TAKE = 100;
/** Longest search term forwarded to the database; longer input is truncated, not rejected. */
export const ARTIST_LISTING_MAX_SEARCH_LENGTH = 100;

/** Sort orders the index offers, in the order the toggle presents them. */
export const ARTIST_LISTING_SORTS = [
  'alpha',
  'newest',
] as const satisfies readonly ArtistListingSort[];

/** Roster filters the index offers, in the order the toggle presents them. */
export const ARTIST_LISTING_ROSTERS = [
  'current',
  'alumni',
  'all',
] as const satisfies readonly ArtistListingRoster[];

/**
 * A query-string integer that is clamped rather than rejected: a missing or
 * non-numeric value falls back to `fallback`, a fraction is truncated, and the
 * result is held within `[min, max]`. Public listing params never 400 —
 * a hand-edited URL still renders a page.
 */
const clampedInt = (min: number, max: number, fallback: number) =>
  z.coerce
    .number()
    .catch(fallback)
    .transform((value) => Math.min(Math.max(Math.trunc(value), min), max));

/**
 * `/api/artists?listing=published` query params. Every field degrades to a
 * usable default instead of failing validation, so the route only ever 4xxs
 * for a rate limit, never for a malformed listing query.
 */
export const artistListingQuerySchema = z
  .object({
    search: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim().slice(0, ARTIST_LISTING_MAX_SEARCH_LENGTH);
        return trimmed ? trimmed : undefined;
      }),
    sort: z.enum(ARTIST_LISTING_SORTS).catch('alpha'),
    roster: z.enum(ARTIST_LISTING_ROSTERS).catch('current'),
    skip: clampedInt(0, Number.MAX_SAFE_INTEGER, 0),
    take: clampedInt(1, ARTIST_LISTING_MAX_TAKE, ARTIST_LISTING_DEFAULT_TAKE),
  })
  .transform(({ search, ...rest }): ArtistListingFilters => ({
    ...rest,
    ...(search && { search }),
  }));

/** The parsed listing query — the exact filters the service accepts. */
export type ArtistListingQuery = z.infer<typeof artistListingQuerySchema>;
