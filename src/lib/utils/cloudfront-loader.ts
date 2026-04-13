/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// lib/cloudfront-loader.ts
import type { ImageLoaderProps } from 'next/image';

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

const MAX_IMAGE_WIDTH = 1920;

export const cloudfrontLoader = ({ src, width, quality }: ImageLoaderProps): string => {
  const cappedWidth = Math.min(width, MAX_IMAGE_WIDTH);
  const encodedSrc = src
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${CDN_DOMAIN}/media/banners/${encodedSrc}?w=${cappedWidth}&q=${quality || 80}&f=webp`;
};

/**
 * Builds a full CDN URL for a banner image at max width, suitable for
 * server-side `<link rel="preload">` tags to eliminate LCP delay.
 */
export const buildBannerPreloadUrl = (imageFilename: string): string => {
  const encodedFilename = imageFilename
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${CDN_DOMAIN}/media/banners/${encodedFilename}?w=${MAX_IMAGE_WIDTH}&q=80&f=webp`;
};

/** Device sizes matching next.config.ts for responsive preload srcset */
const DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920];

/** Default quality Next.js passes to image loaders (must match to avoid double download) */
const NEXT_DEFAULT_QUALITY = 75;

/**
 * Builds a responsive `imagesrcset` string for a banner image, matching
 * the srcset that Next.js `<Image>` generates with the cloudfrontLoader.
 * Used in `<link rel="preload" as="image" imagesrcset="..." imagesizes="100vw">`
 * so the browser preloads the correct size for the viewport.
 *
 * Quality MUST match what Next.js `<Image>` passes to the loader (default 75).
 * A mismatch produces different URLs, causing a wasted double download.
 */
export const buildBannerPreloadSrcSet = (imageFilename: string): string => {
  const encodedFilename = imageFilename
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return DEVICE_SIZES.map(
    (w) =>
      `${CDN_DOMAIN}/media/banners/${encodedFilename}?w=${w}&q=${NEXT_DEFAULT_QUALITY}&f=webp ${w}w`
  ).join(', ');
};
