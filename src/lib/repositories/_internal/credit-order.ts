/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Prisma } from '@prisma/client';

/**
 * The one ordering of a release's credits: by stored `position`, then by
 * `id` for rows that predate the field (all 0), which is the order they were
 * inserted in. Position 0 is the **album artist**. Proved by
 * `artist-credit-repository.contract.spec.ts`.
 */
export const creditOrderBy = [
  { position: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.ArtistReleaseOrderByWithRelationInput[];

/**
 * The only way to load a release's credits: any projection, always in
 * {@link creditOrderBy}. Every `artistReleases` load in the repositories is
 * built from this — `credit-order.spec.ts` scans for one that is not — so an
 * unordered read cannot be written. The 2026-10-03 credit-order work left
 * one include (the artist page's) ordering by Mongo's natural order while
 * every release read ordered by position; after a reorder the two pages
 * named different album artists.
 */
export const orderedCredits = <A extends Omit<Prisma.Release$artistReleasesArgs, 'orderBy'>>(
  args: A
): A & { orderBy: typeof creditOrderBy } => ({ ...args, orderBy: creditOrderBy });
