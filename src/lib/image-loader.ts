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
  // Absolute URLs (CDN, blob, data URIs, other origins): pass through unchanged.
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('blob:') ||
    src.startsWith('data:')
  ) {
    return src;
  }

  // Relative paths (e.g. `/media/releases/coverart/cover.jpg`): prepend CDN domain
  // and insert the width variant suffix before the file extension.
  const path = src.startsWith('/') ? src : `/${src}`;
  const lastDot = path.lastIndexOf('.');

  if (lastDot === -1) {
    return `${CDN_DOMAIN}${path}`;
  }

  const base = path.substring(0, lastDot);
  const ext = path.substring(lastDot);
  return `${CDN_DOMAIN}${base}_w${width}${ext}`;
}
