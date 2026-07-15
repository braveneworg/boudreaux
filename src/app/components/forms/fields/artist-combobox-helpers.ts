/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// ---------------------------------------------------------------------------
// Shared types and pure helpers for artist combobox components.
// Note: ArtistRow uses `displayName: string | null` which differs from the
// ArtistOption shape in artist-multi-select (displayName: string, id-based).
// Do not conflate them.
// ---------------------------------------------------------------------------

export interface ArtistRow {
  id: string;
  displayName: string | null;
  firstName: string | null;
  surname: string;
  slug: string;
}

/**
 * Build the artist-list query params: when there is a search term it filters
 * by it with no `take` cap; otherwise it falls back to the first 5 artists.
 */
export const buildArtistListParams = (
  debouncedSearch: string
): { search: string | undefined; take: number | undefined } => ({
  search: debouncedSearch || undefined,
  take: debouncedSearch ? undefined : 5,
});

/**
 * Resolve a display label for an artist row, falling back to
 * firstName + surname, then to the sentinel string "(no name)".
 */
export const getArtistDisplayName = (artist: ArtistRow): string => {
  if (artist.displayName) return artist.displayName;
  const parts = [artist.firstName, artist.surname].filter(Boolean);
  return parts.join(' ') || '(no name)';
};
