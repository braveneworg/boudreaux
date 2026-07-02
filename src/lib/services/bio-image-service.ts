/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash, randomUUID } from 'crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime';
import sharp from 'sharp';

import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { generateVariantsFromBuffer } from '@/lib/utils/image-variants';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

const MAX_BYTES = 50 * 1024 * 1024;
const THUMBNAIL_WIDTH = 384;
const logger = loggers.media;

export interface RehostedImage {
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * Return value of {@link BioImageService.rehostImages}. Carries both the
 * position-preserving results array and a map of any duplicate indices so
 * callers can alias `image:N` placeholders to the surviving copy's URL.
 */
export interface RehostImagesResult {
  /** Position-preserving array: `RehostedImage` on success, `null` on failure or duplicate. */
  results: Array<RehostedImage | null>;
  /**
   * Maps each duplicate's original input index to the surviving copy's CDN URL.
   * Allows callers to resolve `image:N` placeholders even when index N was deduped.
   */
  duplicateAliases: Map<number, string>;
}

/**
 * Skip the network/S3 round-trip in E2E and fake-generation modes — the bio
 * fixture already supplies a renderable URL, so re-hosting is a no-op there.
 */
const shouldSkipRehost = (): boolean =>
  process.env.BIO_GENERATOR_FAKE === 'true' ||
  process.env.E2E_MODE === 'true' ||
  process.env.NEXT_PUBLIC_E2E_MODE === 'true';

const resolveExtension = (contentType: string | null, sourceUrl: string): string => {
  const fromContentType = contentType ? mime.getExtension(contentType.split(';')[0].trim()) : null;
  if (fromContentType) {
    return `.${fromContentType}`;
  }
  try {
    const match = new URL(sourceUrl).pathname.match(/\.([a-z0-9]+)$/i);
    if (match) return `.${match[1].toLowerCase()}`;
  } catch {
    // fall through
  }
  return '.jpg';
};

/** Shared fetch + validation helper used by both re-host paths. */
const fetchImageBuffer = async (
  sourceUrl: string
): Promise<{ buffer: Buffer; contentType: string | null }> => {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch image (${response.status})`);
  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`Source is not an image: ${contentType}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) throw new Error('Source image exceeds the 50MB limit');
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

/**
 * Resize `buffer` to a 384px webp thumbnail and upload it to S3 under the
 * `media/artists/{artistId}/bio/thumbs/` prefix. Shared between
 * {@link BioImageService.rehostThumbnail} and {@link BioImageService.rehostImages}.
 */
const processThumbnail = async (
  buffer: Buffer,
  artistId: string,
  index: number
): Promise<RehostedImage> => {
  const { data, info } = await sharp(buffer)
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const s3Key = `media/artists/${artistId}/bio/thumbs/${index}-${randomUUID().slice(0, 8)}.webp`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getS3BucketName(),
      Key: s3Key,
      Body: data,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
  return { url: buildCdnUrl(s3Key), width: info.width, height: info.height };
};

/**
 * Re-hosts AI-discovered bio images into our own S3 — no external hotlinks.
 */
export class BioImageService {
  /**
   * Fetches an external image, uploads the original to S3 under
   * `media/artists/{artistId}/bio/...`, generates width variants, and returns
   * the CDN URL + dimensions.
   *
   * @param sourceUrl - The external image URL discovered during generation.
   * @param artistId - The owning artist id (for the S3 key namespace).
   * @param index - The image's position (for a stable, readable key prefix).
   * @returns The re-hosted CDN URL and original dimensions.
   * @throws If the fetch fails, the content is not an image, or it is too large.
   */
  static async rehostWithVariants(
    sourceUrl: string,
    artistId: string,
    index: number
  ): Promise<RehostedImage> {
    if (shouldSkipRehost()) {
      return { url: sourceUrl, width: null, height: null };
    }

    const { buffer, contentType } = await fetchImageBuffer(sourceUrl);
    const s3Key = `media/artists/${artistId}/bio/${index}-${randomUUID().slice(0, 8)}${resolveExtension(
      contentType,
      sourceUrl
    )}`;

    const s3Client = getS3Client();
    await s3Client.send(
      new PutObjectCommand({
        Bucket: getS3BucketName(),
        Key: s3Key,
        Body: buffer,
        ContentType: contentType ?? 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    const { width, height } = await generateVariantsFromBuffer(buffer, s3Key);
    return { url: buildCdnUrl(s3Key), width, height };
  }

  /**
   * Fetches an external image and uploads ONE small webp thumbnail — the cheap
   * generation-time pass that keeps candidate palettes rendering from the CDN
   * (no hotlink 403s) without paying for full variants on images the admin may
   * dismiss. Save-time re-hosting upgrades kept images via rehostWithVariants.
   *
   * @param sourceUrl - The external image URL discovered during generation.
   * @param artistId - The owning artist id (for the S3 key namespace).
   * @param index - The image's position (for a stable, readable key prefix).
   * @returns The thumbnail CDN URL and resized dimensions.
   */
  static async rehostThumbnail(
    sourceUrl: string,
    artistId: string,
    index: number
  ): Promise<RehostedImage> {
    if (shouldSkipRehost()) {
      return { url: sourceUrl, width: null, height: null };
    }
    const { buffer } = await fetchImageBuffer(sourceUrl);
    return processThumbnail(buffer, artistId, index);
  }

  /**
   * Re-hosts a batch of images as thumbnails, deduplicating by SHA-256 content
   * hash so the same photo appearing under two different URLs (e.g. a Commons
   * image and a scraped copy) is only uploaded once. The returned `results`
   * array is position-preserving: `null` means the image at that index was
   * either a duplicate or failed to fetch. `duplicateAliases` maps each
   * dropped duplicate's input index to the surviving copy's CDN URL so callers
   * can alias `image:N` placeholders rather than dropping them. In skip-rehost
   * mode there are no buffers to hash, so every image passes through as-is
   * with an empty `duplicateAliases` map.
   *
   * @param images - Source URLs paired with their original indices.
   * @param artistId - The owning artist id (for the S3 key namespace).
   * @returns Position-preserving results and a duplicate-alias map.
   */
  static async rehostImages(
    images: ReadonlyArray<{ url: string; index: number }>,
    artistId: string
  ): Promise<RehostImagesResult> {
    if (shouldSkipRehost()) {
      return {
        results: images.map(({ url }) => ({ url, width: null, height: null })),
        duplicateAliases: new Map(),
      };
    }

    // Phase 1: fetch all images concurrently for parallel I/O.
    // Promise.allSettled preserves input order regardless of download speed,
    // so the sequential pass below can determine the winner by index —
    // not by which fetch happened to finish first.
    const settled = await Promise.allSettled(images.map(({ url }) => fetchImageBuffer(url)));

    // Phase 2: hash-check and upload sequentially in INPUT INDEX ORDER so the
    // lowest-index copy of each distinct hash always survives the dedupe.
    // seenHashes maps content-hash → survivor CDN URL for alias look-ups.
    const seenHashes = new Map<string, string>();
    const results: Array<RehostedImage | null> = [];
    const duplicateAliases = new Map<number, string>();

    for (const [i, result] of settled.entries()) {
      // images and settled always share the same length; the guard is for TS.
      const image = images.at(i);
      if (!image) {
        results.push(null);
        continue;
      }

      if (result.status === 'rejected') {
        logger.warn('Bio image fetch or upload failed', { error: result.reason });
        results.push(null);
        continue;
      }

      try {
        const { buffer } = result.value;
        const hash = createHash('sha256').update(buffer).digest('hex');
        const survivorUrl = seenHashes.get(hash);

        if (survivorUrl !== undefined) {
          logger.warn('bio_image_duplicate_skipped', { index: image.index });
          duplicateAliases.set(image.index, survivorUrl);
          results.push(null);
          continue;
        }

        const rehosted = await processThumbnail(buffer, artistId, image.index);
        seenHashes.set(hash, rehosted.url);
        results.push(rehosted);
      } catch (error) {
        logger.warn('Bio image fetch or upload failed', { error });
        results.push(null);
      }
    }

    return { results, duplicateAliases };
  }
}
