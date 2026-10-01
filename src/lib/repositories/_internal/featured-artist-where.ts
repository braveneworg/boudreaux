/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Featured-artist `where` fragments. A row is published by stamping
 * `publishedOn`, and runs from `featuredOn` until `featuredUntil` — which is
 * usually absent, not null, on a row featured indefinitely. A bare
 * `{ field: null }` misses the absent storage. Proved by
 * `featured-artist-where.contract.spec.ts`.
 */
export const featuredArtistWhere = {
  /** Published: `publishedOn` holds a date. */
  published: isPresent('publishedOn'),
  /** Unpublished: `publishedOn` null or absent (admin draft filter). */
  unpublished: isUnset('publishedOn'),
} as const satisfies Record<string, Prisma.FeaturedArtistWhereInput>;

/**
 * Inside the featured window at `now`: `featuredOn` has arrived and
 * `featuredUntil` is open-ended (null or absent) or still ahead.
 */
export const featuredWindowAt = (now: Date): Prisma.FeaturedArtistWhereInput => ({
  featuredOn: { lte: now },
  OR: [...isUnset('featuredUntil').OR, { featuredUntil: { gte: now } }],
});
