/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Build an RFC 6266 Content-Disposition header value.
 *
 * - `filename` — ASCII-safe fallback (quotes and backslashes escaped).
 * - `filename*` — RFC 5987 UTF-8 encoded form for non-ASCII characters.
 *
 * Using `encodeURIComponent` inside the quoted `filename` parameter is
 * incorrect per the RFC and causes Safari to misidentify the file
 * extension (appending `.download` instead of `.zip`).
 */
export function buildContentDisposition(fileName: string): string {
  const asciiSafe = fileName.replace(/[\\"/]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/%20/g, '+');
  return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encoded}`;
}
