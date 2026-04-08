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
