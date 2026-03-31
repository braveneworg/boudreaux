/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Generate a URL-safe slug from an input string.
 *
 * Logic:
 *   1. Lowercase
 *   2. Strip non-alphanumeric characters (keep spaces and dashes)
 *   3. Replace spaces with dashes
 *   4. Collapse consecutive dashes
 *   5. Trim leading/trailing dashes
 *
 * @param input - The string to slugify (e.g., a display name or full name)
 * @returns A lowercase, dash-separated slug (e.g., "john-doe")
 */
export function generateSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
