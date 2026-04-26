/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Widths we generate `_w{width}` variants for. Used as both `deviceSizes` and
 * `imageSizes` in `next.config.ts` so every srcset entry Next.js emits
 * resolves to a real S3 object — missing variants 403 on the CDN, never 404.
 *
 * Includes small thumbnail widths (256, 384) for components with small
 * `sizes` like the featured-artists carousel. Capped at 1200: the variant
 * generator now uses `withoutEnlargement: true`, so larger asks just emit
 * the original at the requested filename — no need to add 1920+.
 */
export const IMAGE_VARIANT_DEVICE_SIZES = [256, 384, 640, 750, 828, 1080, 1200] as const;
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
