/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure URL-builder shared between the client-side Next.js `<Image>` loader
 * (`src/lib/image-loader.ts`) and server components that need to compute the
 * same URLs for preload/srcset tags. No `'use client'`/`'use server'` so both
 * environments can import it.
 *
 * Mirrors the `_w{width}` + `.webp` transcode convention the variant generator
 * writes to S3.
 */

const CDN_DOMAIN =
  process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? 'https://cdn.fakefourrecords.com';

const SKIP_WIDTH_SUFFIX_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);

/**
 * Path markers for assets stored as a single file with no `_w{width}`
 * variants — requesting a variant 403s on the CDN, so these URLs must pass
 * through unchanged:
 * - `/bio/thumbs/`: generation-time bio thumbnails (one webp each).
 * - `/media/videos/`: video poster frames (`poster-*.jpg|png`, captured at
 *   upload); only cover-art and bio uploads run the variant generator.
 */
const SINGLE_VARIANT_PATH_MARKERS = ['/bio/thumbs/', '/media/videos/'] as const;

const isSingleVariantPath = (pathname: string): boolean =>
  SINGLE_VARIANT_PATH_MARKERS.some((marker) => pathname.includes(marker));

/**
 * Matches an existing `_w{number}` suffix at the end of a filename's base
 * (extension already stripped), e.g. `cover_w1200`. We strip this before
 * re-applying a new width so stored URLs that already encode a variant width
 * don't double-suffix into non-existent paths like `cover_w1200_w828.webp`
 * (which 403 on the CDN).
 */
const EXISTING_WIDTH_SUFFIX_REGEX = /_w\d+$/;

/**
 * Raster extensions that get transcoded to `.webp` by the variant generator.
 * Must stay in sync with `WEBP_TRANSCODE_EXTENSIONS` in
 * `src/lib/constants/image-variants.ts`.
 */
const WEBP_TRANSCODE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp']);

const appendWidthSuffix = (pathname: string, width: number): string => {
  if (isSingleVariantPath(pathname)) {
    return pathname;
  }

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

  // Strip any existing `_w{number}` already present in the filename so we
  // don't produce `cover_w1200_w828.webp` (which doesn't exist on S3).
  const baseWithoutWidth = base.replace(EXISTING_WIDTH_SUFFIX_REGEX, '');

  const outputExt = WEBP_TRANSCODE_EXTENSIONS.has(extLower) ? '.webp' : ext;
  return `${baseWithoutWidth}_w${width}${outputExt}`;
};

/** True when `appendWidthSuffix` leaves the pathname as-is at any width. */
const hasNoWidthVariants = (pathname: string): boolean =>
  appendWidthSuffix(pathname, 1) === pathname;

const isOpaqueSrc = (src: string): boolean => src.startsWith('blob:') || src.startsWith('data:');

const isAbsoluteSrc = (src: string): boolean =>
  src.startsWith('http://') || src.startsWith('https://');

const isCdnOrigin = (url: URL): boolean => url.origin === new URL(CDN_DOMAIN).origin;

/**
 * Leading-slashed, per-segment `encodeURIComponent` path for a relative src,
 * so filenames with spaces or other reserved characters produce valid
 * srcset/preload URLs (raw spaces break srcset parsing and invalidate
 * `<link rel=preload href>`).
 */
const encodeRelativePath = (src: string): string => {
  const rawPath = src.startsWith('/') ? src : `/${src}`;
  return rawPath.split('/').map(encodeURIComponent).join('/');
};

/**
 * Build a CDN URL for a width-variant of an image.
 *
 * @param src - Absolute URL, relative `/media/*` path, or blob/data URI.
 * @param width - The requested image width from the `<Image>` srcset.
 * @returns A direct CDN URL pointing to the pre-generated width variant,
 *   swapping the extension to `.webp` for transcodable raster formats.
 */
export const buildCdnImageVariantUrl = (src: string, width: number): string => {
  if (isOpaqueSrc(src)) {
    return src;
  }

  if (isAbsoluteSrc(src)) {
    const sourceUrl = new URL(src);

    if (!isCdnOrigin(sourceUrl)) {
      return src;
    }

    sourceUrl.pathname = appendWidthSuffix(sourceUrl.pathname, width);
    return sourceUrl.toString();
  }

  // Relative paths (e.g. `/media/releases/coverart/cover.jpg`): prepend CDN
  // domain and insert the width variant suffix before the file extension.
  // Per-segment `encodeURIComponent` so filenames with spaces or other reserved
  // characters produce valid srcset/preload URLs (raw spaces break srcset
  // parsing and invalidate `<link rel=preload href>`).
  return `${CDN_DOMAIN}${appendWidthSuffix(encodeRelativePath(src), width)}`;
};

/** `<Image>` props that point at the right CDN object without the loader warning. */
export interface CdnImageSource {
  src: string;
  unoptimized: boolean;
}

/**
 * Resolves the `src`/`unoptimized` pair for a `<Image>` whose src may have no
 * width variants: a single-variant path, an extension the variant generator
 * skips, an off-CDN URL, or a blob/data URI.
 *
 * The loader serves such a src unchanged at every width, and Next.js warns in
 * development when a custom loader ignores `width`
 * (`next-image-missing-loader-width`). Those srcs come back `unoptimized` with
 * the URL the loader would have produced (a relative path gains the CDN
 * origin, which a bare `unoptimized` would drop), so the browser loads the same
 * object minus a srcset whose entries would all be identical. Every other src
 * is returned untouched for the loader to fan out into `_w{width}` variants.
 *
 * @param src - Absolute URL, relative `/media/*` path, or blob/data URI.
 */
export const resolveCdnImageSource = (src: string): CdnImageSource => {
  if (isOpaqueSrc(src)) {
    return { src, unoptimized: true };
  }

  if (isAbsoluteSrc(src)) {
    const sourceUrl = new URL(src);
    const unoptimized = !isCdnOrigin(sourceUrl) || hasNoWidthVariants(sourceUrl.pathname);
    return { src, unoptimized };
  }

  const encodedPath = encodeRelativePath(src);
  return hasNoWidthVariants(encodedPath)
    ? { src: `${CDN_DOMAIN}${encodedPath}`, unoptimized: true }
    : { src, unoptimized: false };
};
