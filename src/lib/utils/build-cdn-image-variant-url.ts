/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure URL-builder shared between the client-side Next.js `<Image>` loader
 * (`src/lib/image-loader.ts`) and server components that need to compute the
 * same URLs for preload/srcset tags. No `'use client'`/`'use server'` so both
 * environments can import it.
 *
 * Mirrors the `_w{width}` + `.webp` transcode convention the variant generator
 * writes to S3.
 */

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

const SKIP_WIDTH_SUFFIX_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);

/**
 * Matches an existing `_w{number}` suffix at the end of a filename's base
 * (extension already stripped), e.g. `cover_w1200`. We strip this before
 * re-applying a new width so stored URLs that already encode a variant width
 * don't double-suffix into non-existent paths like `cover_w1200_w828.webp`
 * (which 403 on the CDN).
 */
const EXISTING_WIDTH_SUFFIX_REGEX = /_w\d+$/;

/**
 * Raster extensions that get transcoded to `.webp` by the variant generator.
 * Must stay in sync with `WEBP_TRANSCODE_EXTENSIONS` in
 * `src/lib/constants/image-variants.ts`.
 */
const WEBP_TRANSCODE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp']);

function appendWidthSuffix(pathname: string, width: number): string {
  const lastDot = pathname.lastIndexOf('.');

  if (lastDot === -1) {
    return pathname;
  }

  const base = pathname.substring(0, lastDot);
  const ext = pathname.substring(lastDot);
  const extLower = ext.toLowerCase();

  if (SKIP_WIDTH_SUFFIX_EXTENSIONS.has(extLower)) {
    return pathname;
  }

  // Strip any existing `_w{number}` already present in the filename so we
  // don't produce `cover_w1200_w828.webp` (which doesn't exist on S3).
  const baseWithoutWidth = base.replace(EXISTING_WIDTH_SUFFIX_REGEX, '');

  const outputExt = WEBP_TRANSCODE_EXTENSIONS.has(extLower) ? '.webp' : ext;
  return `${baseWithoutWidth}_w${width}${outputExt}`;
}

/**
 * Build a CDN URL for a width-variant of an image.
 *
 * @param src - Absolute URL, relative `/media/*` path, or blob/data URI.
 * @param width - The requested image width from the `<Image>` srcset.
 * @returns A direct CDN URL pointing to the pre-generated width variant,
 *   swapping the extension to `.webp` for transcodable raster formats.
 */
export function buildCdnImageVariantUrl(src: string, width: number): string {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return src;
  }

  if (src.startsWith('http://') || src.startsWith('https://')) {
    const sourceUrl = new URL(src);
    const cdnUrl = new URL(CDN_DOMAIN);

    if (sourceUrl.origin !== cdnUrl.origin) {
      return src;
    }

    sourceUrl.pathname = appendWidthSuffix(sourceUrl.pathname, width);
    return sourceUrl.toString();
  }

  // Relative paths (e.g. `/media/releases/coverart/cover.jpg`): prepend CDN
  // domain and insert the width variant suffix before the file extension.
  // Per-segment `encodeURIComponent` so filenames with spaces or other reserved
  // characters produce valid srcset/preload URLs (raw spaces break srcset
  // parsing and invalidate `<link rel=preload href>`).
  const rawPath = src.startsWith('/') ? src : `/${src}`;
  const encodedPath = rawPath.split('/').map(encodeURIComponent).join('/');
  return `${CDN_DOMAIN}${appendWidthSuffix(encodedPath, width)}`;
}
