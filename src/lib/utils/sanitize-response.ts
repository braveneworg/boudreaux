/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Defensive sanitizer: walks a JSON-shaped value and replaces any string that
 * looks like an inline `data:` URI (above `maxLen`) with `null`.
 *
 * Background: some legacy release records stored cover art as base64 `data:`
 * URIs instead of CDN URLs. Including even one of those in an SSR/RSC response
 * balloons the HTML payload by hundreds of KB, which on throttled mobile
 * networks directly blows up LCP. Stripping them at the response boundary
 * lets the UI fall back to its next-best image source (release.images[0].src
 * or an artist image) and keeps the HTML small.
 *
 * Strings shorter than `maxLen` are kept as-is so small inline SVGs (icons,
 * blur placeholders well under 256 chars) aren't nuked.
 */
export const DEFAULT_INLINE_DATA_URI_LIMIT = 256;

export function stripInlineImageDataUris<T>(
  value: T,
  maxLen: number = DEFAULT_INLINE_DATA_URI_LIMIT
): T {
  if (typeof value === 'string') {
    if (value.length > maxLen && value.startsWith('data:')) {
      return null as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripInlineImageDataUris(v, maxLen)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripInlineImageDataUris(v, maxLen);
    }
    return out as T;
  }
  return value;
}
