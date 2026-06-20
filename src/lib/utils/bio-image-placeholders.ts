/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Matches `src="image:N"` / `src='image:N'` placeholders emitted by the bio
 * generator. The LLM references discovered images by 0-based index rather than
 * copying long URLs; we swap each for the re-hosted CDN URL after re-hosting.
 */
const PLACEHOLDER = /src=(["'])image:(\d+)\1/g;

/**
 * Rewrites `image:N` placeholders in generated bio HTML to the re-hosted CDN URL
 * for image index `N`. Placeholders with no mapped URL (e.g. an image that
 * failed to re-host, or an out-of-range index) are left as-is so the downstream
 * HTML sanitizer drops the non-`http(s)` `src` rather than rendering a broken
 * image. Real `http(s)` `src` values are never matched.
 *
 * @param html - The raw long-bio HTML from the generator.
 * @param urlByIndex - Map of original image index → re-hosted CDN URL.
 * @returns The HTML with resolvable placeholders replaced.
 */
export const replaceBioImagePlaceholders = (
  html: string,
  urlByIndex: Map<number, string>
): string =>
  html.replace(PLACEHOLDER, (match, quote: string, index: string) => {
    const url = urlByIndex.get(Number(index));
    return url ? `src=${quote}${url}${quote}` : match;
  });
