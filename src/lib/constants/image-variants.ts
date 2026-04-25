/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Device sizes we generate `_w{width}` variants for. Capped at 1200 on purpose:
 * `generate-image-variants.ts` skips widths `>= originalWidth`, so a 1920px
 * original would never get a `_w1920` variant, and requesting one produces
 * `ERR_BLOCKED_BY_ORB` (CDN) or 403 (origin) instead of a clean 404.
 */
export const IMAGE_VARIANT_DEVICE_SIZES = [640, 750, 828, 1080, 1200] as const;
export const IMAGE_VARIANT_SUFFIX_REGEX = /_w\d+\.[^/.]+$/i;

/**
 * Raster formats we transcode to WebP for smaller payloads. `.webp` itself is
 * excluded: a `.webp` original already produces `.webp` variants unchanged.
 * `.svg`, `.gif`, `.ico` remain off-limits (vector / animated / icon).
 */
export const WEBP_TRANSCODE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.tiff',
  '.tif',
  '.bmp',
]);

/** WebP encoder quality used by server-action + batch-script transcodes. */
export const WEBP_QUALITY = 82;
