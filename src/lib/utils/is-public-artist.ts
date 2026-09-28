/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The artist fields the public artist rule reads. */
export interface PublicArtistFields {
  isActive: boolean;
  deactivatedAt?: Date | string | null;
  publishedOn?: Date | string | null;
  deletedOn?: Date | string | null;
}

/**
 * Whether an artist is a public artist (ADR-0015): current or alumni,
 * published, and not soft-deleted. Current is `isActive`; an alumnus is
 * inactive with a recorded departure date (`deactivatedAt`). An inactive
 * artist with no departure date is hidden.
 *
 * The in-memory twin of the repository's `publicArtistWhere`. The queries
 * filter hidden artists themselves wherever they can; this is for the one read
 * that must see them first: the artist page derives each release credit from
 * the full credit order, and drops the hidden artists afterwards. An absent
 * `publishedOn`, `deletedOn`, or `deactivatedAt` (legacy documents) counts as
 * unpublished / not deleted / no departure, matching the query.
 */
export const isPublicArtist = ({
  isActive,
  deactivatedAt,
  publishedOn,
  deletedOn,
}: PublicArtistFields): boolean =>
  (isActive || deactivatedAt != null) && publishedOn != null && deletedOn == null;
