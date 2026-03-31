/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Extracts a clean track display title from a file's title or fileName.
 *
 * When `title` (from ID3 metadata) is available, returns it directly.
 * When falling back to `fileName`, strips:
 *   - file extension
 *   - upload hash suffix (e.g., `-1771039644854-5npsru`)
 *   - leading track number (e.g., `01-`)
 *   - artist/album prefixes separated by `---` (e.g., `ceschi---broken-bone-ballads---`)
 *   - replaces remaining hyphens with spaces
 *   - title-cases the result
 *
 * @param title  - The ID3 title tag value (may be null/undefined)
 * @param fileName - The original uploaded file name
 * @returns A human-readable track name
 */
export const getTrackDisplayTitle = (
  title: string | null | undefined,
  fileName: string
): string => {
  if (title) {
    return title;
  }

  // Remove file extension
  let name = fileName.replace(/\.[^.]+$/, '');

  // Remove upload hash suffix (pattern: -<timestamp>-<random>)
  name = name.replace(/-\d{13,}-[a-z0-9]+$/, '');

  // If the name contains `---` delimiters (artist---album---track), take the last segment
  if (name.includes('---')) {
    const segments = name.split('---');
    name = segments[segments.length - 1];
  }

  // Strip leading track number (e.g., "01-", "1-", "01 -")
  name = name.replace(/^\d{1,3}\s*-\s*/, '');

  // Replace hyphens with spaces
  name = name.replace(/-/g, ' ');

  // Trim whitespace
  name = name.trim();

  // Title-case: capitalize the first letter of each word
  name = name.replace(/\b\w/g, (char) => char.toUpperCase());

  return name || fileName;
};
