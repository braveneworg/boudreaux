// This file is part of boudreaux.
//
// Copyright © 2025 Brave New Org
//
// boudreaux is made available under the terms of the Mozilla Public
// License 2.0 (MPL 2.0). See LICENSE or https://opensource.org/licenses/MPL-2.0
// for the full license text.
//
// You are free to use, modify, and distribute this software under the
// terms of the MPL 2.0, provided that you include a copy of the license
// and provide notice of any modifications made.

// lib/cloudfront-loader.ts
import type { ImageLoaderProps } from 'next/image';

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

const MAX_IMAGE_WIDTH = 1920;

export const cloudfrontLoader = ({ src, width, quality }: ImageLoaderProps): string => {
  const cappedWidth = Math.min(width, MAX_IMAGE_WIDTH);
  return `${CDN_DOMAIN}/media/banners/${src}?w=${cappedWidth}&q=${quality || 80}&f=webp`;
};
