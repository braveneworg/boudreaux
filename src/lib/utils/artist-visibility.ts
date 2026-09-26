/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The artist fields the public-visibility rule reads. */
export interface ArtistVisibilityFields {
  isActive: boolean;
  publishedOn?: Date | string | null;
  deletedOn?: Date | string | null;
}

/**
 * Whether the public may see an artist: active, published, and not
 * soft-deleted (#786). The in-memory twin of the repository's public artist
 * `where`, for artists reached through a junction include (band members,
 * bands) where Prisma + MongoDB can't apply a nested `where`. An absent
 * `publishedOn` or `deletedOn` (legacy documents) counts as unpublished /
 * not deleted, matching the Mongo `isSet` handling in the query.
 */
export const isVisibleArtist = ({
  isActive,
  publishedOn,
  deletedOn,
}: ArtistVisibilityFields): boolean => isActive && publishedOn != null && deletedOn == null;
