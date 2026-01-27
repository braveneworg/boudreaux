import type { FeaturedArtist } from '@/lib/types/media-models';

/**
 * Gets the display name for a featured artist.
 *
 * @param featured - The featured artist object
 * @returns The display name in the following priority:
 *   1. FeaturedArtist.displayName if set
 *   2. First artist's displayName or firstName + surname
 *   3. Group name if no artists
 *   4. "Unknown Artist" as fallback
 *
 * @example
 * ```ts
 * const name = getFeaturedArtistDisplayName(featuredArtist);
 * // Returns "DJ Cool" or "John Doe" or "The Band" or "Unknown Artist"
 * ```
 */
export const getFeaturedArtistDisplayName = (featured: FeaturedArtist): string => {
  // Use featured displayName if available
  if (featured.displayName) {
    return featured.displayName;
  }
  // Fall back to first artist's display name
  if (featured.artists && featured.artists.length > 0) {
    const artist = featured.artists[0];
    return artist.displayName ?? `${artist.firstName} ${artist.surname}`;
  }
  // Fall back to group name
  if (featured.group) {
    return featured.group.name;
  }
  return 'Unknown Artist';
};
