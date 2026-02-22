/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Utility functions for the public releases pages.
 * These helpers operate on the lightweight artist/release shapes from
 * PublishedReleaseListing and related types, distinct from the admin-level
 * utilities that use the full Artist/Release Prisma types.
 */

// =============================================================================
// Types for the lightweight shapes used by these helpers
// =============================================================================

/** Lightweight artist shape from PublishedReleaseListing includes */
interface ReleaseArtist {
  id: string;
  firstName: string;
  surname: string;
  displayName: string | null;
  groups: Array<{
    id: string;
    artistId: string;
    groupId: string;
    group: { id: string; displayName: string | null };
  }>;
}

/** Minimal release shape for cover art extraction */
interface ReleaseCoverArtSource {
  title: string;
  coverArt: string;
  images: Array<{
    id: string;
    src: string | null;
    altText: string | null;
    sortOrder: number;
  }>;
}

/** Minimal release shape for Bandcamp URL extraction */
interface ReleaseBandcampSource {
  releaseUrls: Array<{
    id: string;
    releaseId: string;
    urlId: string;
    url: {
      id: string;
      platform: string;
      url: string;
    };
  }>;
}

/** Minimal release shape for building search values */
interface ReleaseSearchSource {
  title: string;
  artistReleases: Array<{
    artist: {
      firstName: string;
      surname: string;
      displayName: string | null;
      groups: Array<{
        group: { displayName: string | null };
      }>;
    };
  }>;
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Get the display name for an artist on the public releases page.
 * Implements the fallback chain:
 * 1. `artist.displayName` (if non-null and non-empty)
 * 2. `artist.firstName + ' ' + artist.surname` (if either is non-empty)
 * 3. First group's `displayName` (if available and non-null)
 * 4. `'Unknown Artist'`
 *
 * @param artist - Lightweight artist object with groups included
 * @returns The resolved display name string
 */
export const getArtistDisplayNameForRelease = (artist: ReleaseArtist): string => {
  // 1. Prefer explicit display name
  if (artist.displayName) {
    return artist.displayName;
  }

  // 2. Construct from firstName + surname
  const fullName = [artist.firstName, artist.surname].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  // 3. Fall back to first group's display name
  const groupDisplayName = artist.groups[0]?.group?.displayName;
  if (groupDisplayName) {
    return groupDisplayName;
  }

  // 4. Ultimate fallback
  return 'Unknown Artist';
};

/**
 * Extract cover art information from a release, following the fallback chain:
 * 1. `release.coverArt` (if non-empty string)
 * 2. `release.images[0].src` (first image by sort order)
 * 3. `null` (no cover art available — caller renders styled placeholder)
 *
 * @param release - Release with coverArt field and images array
 * @returns Object with `src` and `alt`, or `null` if no cover art
 */
export const getReleaseCoverArt = (
  release: ReleaseCoverArtSource
): { src: string; alt: string } | null => {
  // 1. Use coverArt field if non-empty
  if (release.coverArt) {
    return {
      src: release.coverArt,
      alt: `${release.title} cover art`,
    };
  }

  // 2. Fall back to first image
  const firstImage = release.images[0];
  if (firstImage?.src) {
    return {
      src: firstImage.src,
      alt: firstImage.altText || `${release.title} cover art`,
    };
  }

  // 3. No cover art available
  return null;
};

/**
 * Extract the Bandcamp URL from a release's associated URLs.
 *
 * @param release - Release with releaseUrls including url records
 * @returns The Bandcamp URL string, or `null` if not found
 */
export const getBandcampUrl = (release: ReleaseBandcampSource): string | null => {
  const bandcampReleaseUrl = release.releaseUrls.find((ru) => ru.url.platform === 'BANDCAMP');
  return bandcampReleaseUrl?.url.url ?? null;
};

/**
 * Build a searchable value string for a release, used as the `value` prop
 * on cmdk's `CommandItem`. Concatenates title, artist names (first, surname,
 * displayName), and group names into a single lowercase string for matching.
 *
 * @param release - Release with title and artistReleases with artist+groups
 * @returns Lowercase string with all searchable fields joined by spaces
 */
export const buildReleaseSearchValue = (release: ReleaseSearchSource): string => {
  const parts: string[] = [release.title];

  for (const ar of release.artistReleases) {
    const { firstName, surname, displayName } = ar.artist;
    if (firstName) parts.push(firstName);
    if (surname) parts.push(surname);
    if (displayName) parts.push(displayName);

    for (const g of ar.artist.groups) {
      if (g.group.displayName) parts.push(g.group.displayName);
    }
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
};
