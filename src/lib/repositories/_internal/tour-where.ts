/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `where` fragments that decide what of a tour the public may see
 * (ADR-0015). A hidden artist's name never reaches a public tour payload, and
 * a show that would name nobody else is not announced.
 *
 * Every shape here was probed on the Docker Mongo, including a tour with no
 * dates: see `docs/lessons/prisma-mongo/`.
 */

import { publicArtistWhere } from './artist-where';
import { isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/** A headliner row that names no artist (absent counts as none). */
const namesNoArtist = isUnset('artistId') satisfies Prisma.TourDateHeadlinerWhereInput;

/** A headliner the public may see: one whose artist is a public artist. */
export const publicHeadlinerWhere = {
  artist: { is: publicArtistWhere },
} as const satisfies Prisma.TourDateHeadlinerWhereInput;

/**
 * A tour date the public may see: it names no artist at all (a show still to
 * be announced), or at least one public artist. A date whose artist
 * headliners are all hidden is dropped.
 *
 * `every` rather than `none: { artistId: { not: null } }`: the probe showed
 * the latter misses a date whose only headliner row has no artist.
 */
export const visibleTourDateWhere = {
  OR: [{ headliners: { every: namesNoArtist } }, { headliners: { some: publicHeadlinerWhere } }],
} as const satisfies Prisma.TourDateWhereInput;

/**
 * A tour the public may see: it has no dates yet, or at least one date the
 * public may see. A tour whose dates are all hidden is dropped.
 */
export const visibleTourWhere = {
  OR: [{ tourDates: { none: {} } }, { tourDates: { some: visibleTourDateWhere } }],
} as const satisfies Prisma.TourWhereInput;
