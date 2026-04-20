/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime';
import sharp from 'sharp';

import { requireRole } from '@/lib/utils/auth/require-role';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

/** Device sizes from next.config.ts — widths we generate variants for. */
const DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920] as const;

/** Extensions that cannot be raster-resized. */
const SKIP_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);

export interface GenerateImageVariantsResult {
  success: boolean;
  variantsGenerated: number;
  error?: string;
}

/**
 * Extract the S3 object key from a CDN URL.
 *
 * Strips the protocol + domain, leaving the path portion which doubles as
 * the S3 key (e.g. `media/releases/coverart/foo-123.jpg`).
 */
function extractS3Key(cdnUrl: string): string {
  try {
    const url = new URL(cdnUrl);
    // Remove leading slash
    return url.pathname.replace(/^\//, '');
  } catch {
    // If not a valid URL, treat the whole string as a key
    return cdnUrl.replace(/^\//, '');
  }
}

function getExtension(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.substring(dot).toLowerCase();
}

function buildVariantKey(originalKey: string, width: number): string {
  const dot = originalKey.lastIndexOf('.');
  if (dot === -1) return `${originalKey}_w${width}`;
  const base = originalKey.substring(0, dot);
  const ext = originalKey.substring(dot);
  return `${base}_w${width}${ext}`;
}

/**
 * Server action: generate width-variant images for a freshly-uploaded image.
 *
 * Downloads the original from S3, resizes it to each device-size breakpoint
 * that is smaller than the original, and uploads the variants back to S3
 * with `_w{width}` suffix naming.
 *
 * Requires admin role. Intended to be called fire-and-forget after an image
 * upload completes — failure is non-fatal since the batch script can backfill.
 */
export const generateImageVariantsAction = async (
  cdnUrl: string
): Promise<GenerateImageVariantsResult> => {
  await requireRole('admin');

  try {
    const s3Key = extractS3Key(cdnUrl);
    const ext = getExtension(s3Key);

    if (SKIP_EXTENSIONS.has(ext)) {
      return { success: true, variantsGenerated: 0 };
    }

    const s3Client = getS3Client();
    const bucket = getS3BucketName();

    // Download the original image
    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    const response = await s3Client.send(getCommand);
    const stream = response.Body;

    if (!stream) {
      return { success: false, variantsGenerated: 0, error: 'Empty response body from S3' };
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width ?? 0;

    if (originalWidth === 0) {
      return { success: false, variantsGenerated: 0, error: 'Could not determine image width' };
    }

    const contentType = mime.getType(s3Key) ?? 'application/octet-stream';
    let variantsGenerated = 0;

    // Generate and upload each variant
    for (const targetWidth of DEVICE_SIZES) {
      if (targetWidth >= originalWidth) {
        continue;
      }

      const variantKey = buildVariantKey(s3Key, targetWidth);
      const resized = await sharp(buffer)
        .resize(targetWidth, undefined, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: variantKey,
        Body: resized,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      });

      await s3Client.send(putCommand);
      variantsGenerated++;
    }

    return { success: true, variantsGenerated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generateImageVariants] Error:', errorMessage);
    return { success: false, variantsGenerated: 0, error: errorMessage };
  }
};
