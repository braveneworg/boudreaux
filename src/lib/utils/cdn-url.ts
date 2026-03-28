/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Build a public CDN URL from an S3 object key.
 *
 * Uses `NEXT_PUBLIC_CDN_DOMAIN` (available on both client and server).
 * Falls back to `CDN_DOMAIN` (server-only) if the public var is unset.
 *
 * @param s3Key - The S3 object key (e.g., "releases/abc/digital-formats/MP3_320KBPS/tracks/1-file.mp3")
 * @returns The full CDN URL (e.g., "https://cdn.example.com/releases/abc/...")
 */
export function buildCdnUrl(s3Key: string): string {
  const raw = process.env.NEXT_PUBLIC_CDN_DOMAIN || process.env.CDN_DOMAIN || '';
  const cdnBase = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!cdnBase) {
    return s3Key;
  }

  return `https://${cdnBase}/${s3Key}`;
}
