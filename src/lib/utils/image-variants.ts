/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime';
import sharp from 'sharp';

import {
  IMAGE_VARIANT_DEVICE_SIZES,
  WEBP_QUALITY,
  WEBP_TRANSCODE_EXTENSIONS,
} from '@/lib/constants/image-variants';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

/** Extensions that cannot be raster-resized. */
const SKIP_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);

/** Lower-cased file extension (including the dot), or '' when none. */
export const getExtension = (key: string): string => {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.substring(dot).toLowerCase();
};

/** Build the `_w{width}` variant key, optionally overriding the extension. */
export const buildVariantKey = (
  originalKey: string,
  width: number,
  overrideExt?: string
): string => {
  const dot = originalKey.lastIndexOf('.');
  if (dot === -1) return `${originalKey}_w${width}${overrideExt ?? ''}`;
  const base = originalKey.substring(0, dot);
  const ext = overrideExt ?? originalKey.substring(dot);
  return `${base}_w${width}${ext}`;
};

export interface VariantGenerationResult {
  variantsGenerated: number;
  width: number;
  height: number;
}

/**
 * Resize an in-memory image to every device-size breakpoint and upload the
 * `_w{width}` variants (plus a WebP sibling for transcodable formats) to S3.
 *
 * `withoutEnlargement: true` clamps output to the original's native size so a
 * small source still emits every `_w{width}` filename (no 403s in the srcset).
 *
 * @param buffer - The full-resolution source image bytes.
 * @param s3Key - The S3 key of the already-uploaded original (e.g.
 * `media/artists/{id}/bio/0-abc.jpg`); variant keys are derived from it.
 * @returns The number of variants written and the original dimensions.
 * @throws If the image width cannot be determined.
 */
export const generateVariantsFromBuffer = async (
  buffer: Buffer,
  s3Key: string
): Promise<VariantGenerationResult> => {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width === 0) {
    throw new Error('Could not determine image width');
  }

  const ext = getExtension(s3Key);
  if (SKIP_EXTENSIONS.has(ext)) {
    return { variantsGenerated: 0, width, height };
  }

  const s3Client = getS3Client();
  const bucket = getS3BucketName();
  const contentType = mime.getType(s3Key) ?? 'application/octet-stream';
  const shouldTranscodeToWebp = WEBP_TRANSCODE_EXTENSIONS.has(ext);

  // Each variant (and its WebP sibling) is independent — derived from the same
  // source buffer, written to a distinct key — so encode + upload them
  // concurrently instead of serializing one S3 round trip after another.
  const upload = async (
    key: string,
    pipeline: sharp.Sharp,
    variantContentType: string
  ): Promise<void> => {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await pipeline.toBuffer(),
        ContentType: variantContentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
  };

  const tasks = IMAGE_VARIANT_DEVICE_SIZES.flatMap((targetWidth) => {
    const pipeline = sharp(buffer).resize(targetWidth, undefined, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    const variants = [upload(buildVariantKey(s3Key, targetWidth), pipeline.clone(), contentType)];
    if (shouldTranscodeToWebp) {
      variants.push(
        upload(
          buildVariantKey(s3Key, targetWidth, '.webp'),
          pipeline.clone().webp({ quality: WEBP_QUALITY }),
          'image/webp'
        )
      );
    }
    return variants;
  });

  await Promise.all(tasks);

  return { variantsGenerated: tasks.length, width, height };
};
