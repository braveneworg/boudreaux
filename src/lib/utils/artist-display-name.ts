/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Artist } from '@prisma/client';

/**
 * Get the display name for an artist in tour context with fallback logic.
 *
 * Fallback Algorithm:
 * 1. Use artist.displayName if present
 * 2. Fall back to firstName + " " + surname
 * 3. Fall back to "Unknown Artist"
 *
 * @param artist - Artist from Prisma
 * @returns The computed display name string
 *
 * @example
 * ```typescript
 * const name = getArtistDisplayNameForTour(artist);
 * // Returns: "Artist Name" or "John Doe" or "Unknown Artist"
 * ```
 */
export function getArtistDisplayNameForTour(artist: Artist): string {
  // 1. Check artist displayName
  if (artist.displayName?.trim()) {
    return artist.displayName.trim();
  }

  // 2. Construct from firstName + surname
  const firstName = artist.firstName?.trim() || '';
  const surname = artist.surname?.trim() || '';

  if (firstName && surname) {
    return `${firstName} ${surname}`;
  } else if (firstName) {
    return firstName;
  } else if (surname) {
    return surname;
  }

  // 3. Final fallback
  return 'Unknown Artist';
}
