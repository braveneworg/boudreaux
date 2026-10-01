/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The artist fields the public artist rule reads. */
export interface PublicArtistFields {
  publishedOn?: Date | string | null;
  deletedOn?: Date | string | null;
}

/**
 * Whether an artist is a public artist (ADR-0015, ADR-0016): published and
 * not soft-deleted. Whether the artist is still on the label plays no part.
 *
 * The in-memory twin of the repository's `publicArtistWhere`. The queries
 * filter hidden artists themselves wherever they can; this is for the one read
 * that must see them first: the artist page derives each release credit from
 * the full credit order, and drops the hidden artists afterwards. An absent
 * `publishedOn` or `deletedOn` (legacy documents) counts as unpublished / not
 * deleted, matching the query.
 */
export const isPublicArtist = ({ publishedOn, deletedOn }: PublicArtistFields): boolean =>
  publishedOn != null && deletedOn == null;
