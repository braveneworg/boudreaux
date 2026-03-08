/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Artist, ArtistGroup, Group } from '@prisma/client';

type ArtistWithGroups = Artist & {
  groups?: Array<ArtistGroup & { group: Group }>;
};

/**
 * Get the display name for an artist in tour context with fallback logic.
 *
 * Fallback Algorithm:
 * 1. Use artist.displayName if present
 * 2. Fall back to group.displayName if artist is in a group
 * 3. Fall back to firstName + " " + surname
 * 4. Fall back to "Unknown Artist"
 *
 * @param artist - Artist with optional groups relationship
 * @returns The computed display name string
 *
 * @example
 * ```typescript
 * const name = getArtistDisplayNameForTour(artistWithGroups);
 * // Returns: "Artist Name" or "Band Name" or "John Doe" or "Unknown Artist"
 * ```
 */
export function getArtistDisplayNameForTour(artist: ArtistWithGroups): string {
  // 1. Check artist displayName
  if (artist.displayName?.trim()) {
    return artist.displayName.trim();
  }

  // 2. Check for group displayName (if artist has groups)
  if (artist.groups && artist.groups.length > 0) {
    const firstGroup = artist.groups[0].group;
    if (firstGroup.displayName?.trim()) {
      return firstGroup.displayName.trim();
    }
  }

  // 3. Construct from firstName + surname
  const firstName = artist.firstName?.trim() || '';
  const surname = artist.surname?.trim() || '';

  if (firstName && surname) {
    return `${firstName} ${surname}`;
  } else if (firstName) {
    return firstName;
  } else if (surname) {
    return surname;
  }

  // 4. Final fallback
  return 'Unknown Artist';
}
