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
 * The pure URL-building logic lives in `build-cdn-image-variant-url.ts`
 * without a directive so server components (e.g. `<link rel=preload>` in
 * `app/page.tsx`) can compute matching URLs.
 *
 * Configured via `images.loaderFile` in `next.config.ts`.
 */

import { buildCdnImageVariantUrl } from '@/lib/utils/build-cdn-image-variant-url';

interface ImageLoaderParams {
  src: string;
  width: number;
  quality?: number;
}

/**
 * @param src - Absolute URL, relative `/media/*` path, or blob URL.
 * @param width - The requested image width from the `<Image>` component's srcset.
 */
export default function imageLoader({ src, width }: ImageLoaderParams): string {
  return buildCdnImageVariantUrl(src, width);
}
