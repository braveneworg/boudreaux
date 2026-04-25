/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

/**
 * Global custom image loader for Next.js `<Image>` components.
 *
 * Produces direct CDN URLs so images are served from the CloudFront edge
 * instead of routing through the Next.js `/_next/image` optimizer (which
 * does not exist on the CDN origin).
 *
 * Configured via `images.loaderFile` in `next.config.ts`.
 */

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

interface ImageLoaderParams {
  src: string;
  width: number;
  quality?: number;
}

const SKIP_WIDTH_SUFFIX_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);

/**
 * Raster extensions that get transcoded to `.webp` by the variant generator.
 * The loader mirrors that naming so `<Image>` fetches the smaller WebP variant.
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

  const outputExt = WEBP_TRANSCODE_EXTENSIONS.has(extLower) ? '.webp' : ext;
  return `${base}_w${width}${outputExt}`;
}

/**
 * @param src - Absolute URL, relative `/media/*` path, or blob URL.
 * @param width - The requested image width from the `<Image>` component's srcset.
 * @returns A direct CDN URL pointing to the pre-generated width variant.
 *
 * For relative paths, appends `_w{width}` before the file extension so the
 * browser fetches a size-appropriate variant from S3/CloudFront
 * (e.g. `/media/banners/hero.webp` at 1080px → `…/hero_w1080.webp`).
 */
export default function imageLoader({ src, width }: ImageLoaderParams): string {
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

  // Relative paths (e.g. `/media/releases/coverart/cover.jpg`): prepend CDN domain
  // and insert the width variant suffix before the file extension. Per-segment
  // encodeURIComponent so filenames with spaces or other reserved characters
  // produce valid srcset/preload URLs (raw spaces break srcset parsing and
  // invalidate `<link rel=preload href>`).
  const rawPath = src.startsWith('/') ? src : `/${src}`;
  const encodedPath = rawPath.split('/').map(encodeURIComponent).join('/');
  return `${CDN_DOMAIN}${appendWidthSuffix(encodedPath, width)}`;
}
