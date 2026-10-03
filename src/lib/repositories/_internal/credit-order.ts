/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Prisma } from '@prisma/client';

/**
 * The one ordering of a release's credits: by stored `position`, then by
 * `id` for rows that predate the field (all 0), which is the order they were
 * inserted in. Position 0 is the **album artist**. Every read of
 * `artistReleases` orders by this; proved by
 * `artist-credit-repository.contract.spec.ts`.
 */
export const creditOrderBy = [
  { position: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.ArtistReleaseOrderByWithRelationInput[];
