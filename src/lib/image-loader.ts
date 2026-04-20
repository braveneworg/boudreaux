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
 * @returns A direct CDN URL the browser fetches from the edge.
 *
 * `width` and `quality` are intentionally unused — CloudFront's cache policy
 * strips query strings, so S3 always serves the original file regardless.
 */
export default function imageLoader({ src }: ImageLoaderParams): string {
  // Absolute URLs (CDN, blob, other origins): pass through unchanged.
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
    return src;
  }

  // Relative paths (e.g. `/media/releases/coverart/cover.jpg`): prepend CDN domain.
  const path = src.startsWith('/') ? src : `/${src}`;
  return `${CDN_DOMAIN}${path}`;
}
