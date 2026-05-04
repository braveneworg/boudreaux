/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { signStreamUrl } from '@/lib/utils/sign-stream-url';

/**
 * Minimal shape we mutate. We deliberately use a structural type (rather
 * than the Prisma-generated payload) so this helper can walk any payload
 * that contains digital-format files — featured artists, release detail,
 * artist with releases — without coupling to those specific types.
 */
interface FileLike {
  s3Key?: string | null;
  streamUrl?: string | null;
}

interface DigitalFormatLike {
  files?: FileLike[] | null;
}

/**
 * Mutate every file under `digitalFormat.files` (singular, as on
 * `FeaturedArtist`) and `digitalFormats[].files` (plural, as on `Release`)
 * to include a `streamUrl` field. The mutation cascades into nested
 * `release` / `releases[].release` objects so the artist-with-releases
 * payload is covered too.
 *
 * `streamUrl` is a CloudFront signed URL valid for 24 hours, or `null`
 * when CloudFront signing is unconfigured (the client falls back to
 * `buildCdnUrl(s3Key)` in that case).
 *
 * The function mutates in place and also returns the same reference for
 * ergonomic chaining inside route handlers.
 */
export function attachStreamUrls<T>(payload: T): T {
  walk(payload as unknown);
  return payload;
}

function walk(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }

  const obj = node as Record<string, unknown>;

  // FeaturedArtist shape: digitalFormat?.files[]
  const digitalFormat = obj.digitalFormat as DigitalFormatLike | null | undefined;
  if (digitalFormat && Array.isArray(digitalFormat.files)) {
    signFiles(digitalFormat.files);
  }

  // Release shape: digitalFormats[].files[]
  const digitalFormats = obj.digitalFormats as DigitalFormatLike[] | null | undefined;
  if (Array.isArray(digitalFormats)) {
    for (const fmt of digitalFormats) {
      if (fmt && Array.isArray(fmt.files)) {
        signFiles(fmt.files);
      }
    }
  }

  // Recurse into nested release / releases / artists structures so the
  // artist-with-releases payload (releases[].release.digitalFormats[]) and
  // featured-artist payload (artists[].digitalFormat) get covered.
  for (const key of ['release', 'releases', 'artists', 'artist']) {
    if (key in obj) walk(obj[key]);
  }
}

function signFiles(files: FileLike[]): void {
  for (const file of files) {
    if (!file || typeof file !== 'object') continue;
    if (file.streamUrl) continue; // idempotent
    file.streamUrl = signStreamUrl(file.s3Key);
  }
}
