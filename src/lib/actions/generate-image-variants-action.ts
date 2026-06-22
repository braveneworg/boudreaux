/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { GetObjectCommand } from '@aws-sdk/client-s3';

import { IMAGE_VARIANT_SUFFIX_REGEX } from '@/lib/constants/image-variants';
import { requireRole } from '@/lib/utils/auth/require-role';
import { generateVariantsFromBuffer, getExtension } from '@/lib/utils/image-variants';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { generateImageVariantsSchema } from '@/lib/validation/admin-asset-schemas';

/** Extensions that cannot be raster-resized. */
const SKIP_EXTENSIONS = new Set(['.svg', '.gif', '.ico']);
const ALLOWED_KEY_PREFIX = 'media/';
// Aligned with the 50MB ceiling enforced by `presigned-upload-actions.ts` for
// images. Anything that fits the upload pipe should fit the variant pipe; PNGs
// at album-cover resolution routinely exceed 20MB so the previous limit was
// silently rejecting valid uploads.
const MAX_SOURCE_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

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
const extractS3Key = (cdnUrl: string): string => {
  try {
    const url = new URL(cdnUrl);
    // Remove leading slash
    return decodeURIComponent(url.pathname).replace(/^\//, '');
  } catch {
    // If not a valid URL, treat the whole string as a key
    return cdnUrl.replace(/^\//, '');
  }
};

const validateSourceKey = (
  key: string
): {
  isValid: boolean;
  shouldSkip: boolean;
  error?: string;
} => {
  if (!key || key.trim().length === 0) {
    return { isValid: false, shouldSkip: false, error: 'Invalid image key' };
  }

  if (!key.startsWith(ALLOWED_KEY_PREFIX)) {
    return {
      isValid: false,
      shouldSkip: false,
      error: `Image key must start with "${ALLOWED_KEY_PREFIX}"`,
    };
  }

  if (IMAGE_VARIANT_SUFFIX_REGEX.test(key)) {
    return { isValid: true, shouldSkip: true };
  }

  return { isValid: true, shouldSkip: false };
};

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

  const parsed = generateImageVariantsSchema.safeParse({ cdnUrl });
  if (!parsed.success) {
    return {
      success: false,
      variantsGenerated: 0,
      error: parsed.error.issues[0].message,
    };
  }

  try {
    const s3Key = extractS3Key(parsed.data.cdnUrl);
    const keyValidation = validateSourceKey(s3Key);

    if (!keyValidation.isValid) {
      return {
        success: false,
        variantsGenerated: 0,
        error: keyValidation.error ?? 'Invalid image key',
      };
    }

    if (keyValidation.shouldSkip) {
      return { success: true, variantsGenerated: 0 };
    }

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
    const contentLength = response.ContentLength;

    if (!stream) {
      return { success: false, variantsGenerated: 0, error: 'Empty response body from S3' };
    }

    if (typeof contentLength === 'number' && contentLength > MAX_SOURCE_IMAGE_SIZE_BYTES) {
      return {
        success: false,
        variantsGenerated: 0,
        error: `Source image exceeds ${MAX_SOURCE_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_SOURCE_IMAGE_SIZE_BYTES) {
        return {
          success: false,
          variantsGenerated: 0,
          error: `Source image exceeds ${MAX_SOURCE_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`,
        };
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Resize + upload every `_w{width}` variant (and WebP siblings) to S3.
    const { variantsGenerated } = await generateVariantsFromBuffer(buffer, s3Key);

    return { success: true, variantsGenerated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggers.s3.error('[generateImageVariants] Error', error);
    return { success: false, variantsGenerated: 0, error: errorMessage };
  }
};
