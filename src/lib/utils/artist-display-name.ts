/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ArtistScalars } from '@/lib/types/domain/artist';

/**
 * Get the display name for an artist in tour context with fallback logic.
 *
 * Fallback Algorithm:
 * 1. Use artist.displayName if present
 * 2. Fall back to firstName + " " + surname
 * 3. Fall back to null
 *
 * @param artist - Artist scalars (vendor-neutral mirror of the Prisma model)
 * @returns The computed display name string
 *
 * @example
 * ```typescript
 * const name = getArtistDisplayNameForTour(artist);
 * // Returns: "Artist Name" or "John Doe" or null
 * ```
 */
const buildNameFromParts = (firstName: string, surname: string): string | null => {
  if (firstName && surname) {
    return `${firstName} ${surname}`;
  }
  return firstName || surname || null;
};

export const getArtistDisplayNameForTour = (artist: ArtistScalars | null): string | null => {
  if (!artist) {
    return null;
  }

  // 1. Check artist displayName
  if (artist.displayName?.trim()) {
    return artist.displayName.trim();
  }

  // 2. Construct from firstName + surname
  const firstName = artist.firstName?.trim() || '';
  const surname = artist.surname?.trim() || '';

  // 3. No name available → null
  return buildNameFromParts(firstName, surname);
};
