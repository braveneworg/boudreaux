/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Banner preload URL helpers for `<link rel="preload">` tags.
 *
 * These produce URLs that exactly match what the global image loader
 * (`src/lib/image-loader.ts`) generates for `<Image>` components so the
 * browser preload cache hits. No query params — CloudFront's cache policy
 * strips them and S3 serves the original file regardless.
 */

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

/**
 * Builds a full CDN URL for a banner image, suitable for
 * server-side `<link rel="preload">` tags to eliminate LCP delay.
 */
export const buildBannerPreloadUrl = (imageFilename: string): string => {
  const encodedFilename = imageFilename
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${CDN_DOMAIN}/media/banners/${encodedFilename}`;
};

/**
 * Builds a responsive `imagesrcset` string for a banner image, matching
 * the URL that the global image loader produces for `<Image>` components.
 *
 * Since CloudFront serves the same file regardless of requested size,
 * all width descriptors point to the same URL. This is valid — the
 * browser picks the entry whose width descriptor is closest to the
 * viewport width, and they all resolve to the same resource.
 */
export const buildBannerPreloadSrcSet = (imageFilename: string): string => {
  const url = buildBannerPreloadUrl(imageFilename);
  return `${url} 1920w`;
};
