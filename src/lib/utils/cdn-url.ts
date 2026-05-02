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
const E2E_MP3_FALLBACK_PATH = '/e2e/audio/e2e-track-320.mp3';

const isMp3AssetKey = (s3Key: string): boolean => /\.(mp3|mpeg)$/i.test(s3Key);

export function buildCdnUrl(s3Key: string): string {
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === 'true' || process.env.E2E_MODE === 'true';

  if (isE2EMode && isMp3AssetKey(s3Key)) {
    return E2E_MP3_FALLBACK_PATH;
  }

  const raw = process.env.NEXT_PUBLIC_CDN_DOMAIN || process.env.CDN_DOMAIN || '';
  const cdnBase = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');

  if (!cdnBase) {
    return s3Key;
  }

  return `https://${cdnBase}/${s3Key}`;
}

/**
 * Resolve a playable URL for a digital-format file.
 *
 * Prefers a server-attached `streamUrl` (CloudFront signed, see
 * `attach-stream-urls.ts`) so the request passes the CloudFront trusted
 * key-group check on the `releases/*\/digital-formats/*` behaviour.
 *
 * Falls back to an unsigned `buildCdnUrl(s3Key)` when no signed URL is
 * available — preserves dev/E2E behaviour and any cached payloads that
 * predate the signing wiring.
 *
 * @returns A URL suitable for `<audio src>` / `<video src>`, or `null`
 *   when the file has neither a `streamUrl` nor an `s3Key`.
 */
export function resolveStreamUrl(file: {
  s3Key?: string | null;
  streamUrl?: string | null;
}): string | null {
  if (file.streamUrl) return file.streamUrl;
  if (file.s3Key) return buildCdnUrl(file.s3Key);
  return null;
}
