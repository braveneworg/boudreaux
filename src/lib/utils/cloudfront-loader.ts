/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Image preload URL helpers for `<link rel="preload">` tags.
 *
 * These produce URLs that exactly match what the global image loader
 * (`src/lib/image-loader.ts`) generates for `<Image>` components so the
 * browser preload cache hits. Width variants use the `_w{width}` suffix
 * convention (e.g. `hero_w1080.webp`) matching pre-generated S3 objects.
 */

import { IMAGE_VARIANT_DEVICE_SIZES } from '@/lib/constants/image-variants';
import { buildCdnImageVariantUrl } from '@/lib/utils/build-cdn-image-variant-url';

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

/**
 * Builds a full CDN URL for a banner image width variant, suitable for
 * server-side `<link rel="preload">` tags to eliminate LCP delay.
 *
 * When `width` is provided, delegates to `buildCdnImageVariantUrl` so the
 * URL exactly matches what `<Image>` requests via the custom loader —
 * including the JPG/PNG → WebP transcode the variant generator applies.
 */
export const buildBannerPreloadUrl = (imageFilename: string, width?: number): string => {
  const encodedFilename = imageFilename
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  if (!width) {
    return `${CDN_DOMAIN}/media/banners/${encodedFilename}`;
  }

  return buildCdnImageVariantUrl(`/media/banners/${imageFilename}`, width);
};

/**
 * True when `src` is fetchable over the network — preloading `data:`/`blob:`
 * sources is meaningless since their bytes are already local.
 */
export const isPreloadableImageSrc = (src: string): boolean =>
  !src.startsWith('data:') && !src.startsWith('blob:');

/**
 * Builds a responsive `imagesrcset` string for any image path the global
 * loader serves, with one entry per device size matching the `_w{width}`
 * variants. Pair it with an `imageSizes` that mirrors the target `<Image>`'s
 * effective `sizes` so the browser's preload picker and the rendered img
 * select the same variant (and the preload cache hits).
 */
export const buildImagePreloadSrcSet = (src: string): string =>
  IMAGE_VARIANT_DEVICE_SIZES.map((w) => `${buildCdnImageVariantUrl(src, w)} ${w}w`).join(', ');

/**
 * Builds a responsive `imagesrcset` string for a banner image, with one
 * entry per device size matching the width variants the image loader produces.
 */
export const buildBannerPreloadSrcSet = (imageFilename: string): string =>
  buildImagePreloadSrcSet(`/media/banners/${imageFilename}`);
