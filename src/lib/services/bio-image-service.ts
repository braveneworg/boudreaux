/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID } from 'crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime';
import sharp from 'sharp';

import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { generateVariantsFromBuffer } from '@/lib/utils/image-variants';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

const MAX_BYTES = 50 * 1024 * 1024;
const THUMBNAIL_WIDTH = 384;

export interface RehostedImage {
  url: string;
  width: number | null;
  height: number | null;
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
  }
}
