/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The artist fields the public-visibility rule reads. */
export interface ArtistVisibilityFields {
  isActive: boolean;
  deactivatedAt?: Date | string | null;
  publishedOn?: Date | string | null;
  deletedOn?: Date | string | null;
}

/**
 * Whether the public may see an artist: current or alumni, published, and not
 * soft-deleted (#786). Current is `isActive`; an alumnus is inactive with a
 * recorded departure date (`deactivatedAt`), and the index links alumni cards
 * to the detail page (#769), so both must resolve. An inactive artist with no
 * departure date stays hidden. The in-memory twin of the repository's public
 * artist `where`, for artists reached through a junction include (band
 * members, bands) where Prisma + MongoDB can't apply a nested `where`. An
 * absent `publishedOn`, `deletedOn`, or `deactivatedAt` (legacy documents)
 * counts as unpublished / not deleted / no departure, matching how the query
 * treats an absent field.
 */
export const isVisibleArtist = ({
  isActive,
  deactivatedAt,
  publishedOn,
  deletedOn,
}: ArtistVisibilityFields): boolean =>
  (isActive || deactivatedAt != null) && publishedOn != null && deletedOn == null;
