/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ImageRepository } from '@/lib/repositories/image-repository';
import type { ImageListingRecord } from '@/lib/types/domain/image';
import { loggers } from '@/lib/utils/logger';
import { logSecurityEvent } from '@/utils/audit-log';

import { deleteS3Object, extractS3KeyFromImageSrc } from './release-image-actions-helpers';

import type { AdminActionResult } from './run-admin-entity-action';

const logger = loggers.s3;

/**
 * Result type for image upload actions
 */
export interface ImageUploadActionResult {
  success: boolean;
  data?: ImageUploadResultItem[];
  error?: string;
}

interface ImageUploadResultItem {
  id: string;
  src: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
}

const toImageUploadResult = (img: ImageListingRecord): ImageUploadResultItem => ({
  id: img.id,
  src: img.src || '',
  caption: img.caption || undefined,
  altText: img.altText || undefined,
  sortOrder: img.sortOrder,
});

/**
 * Server action to delete a release image
 */
export const deleteReleaseImageAction = async (imageId: string): Promise<AdminActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  try {
    // Get the image to find the src URL
    const image = await ImageRepository.findSourceById(imageId);

    if (!image) {
      return { success: false, error: 'Image not found', code: 'NOT_FOUND' };
    }

    // Extract S3 key from URL and delete from S3
    const s3Bucket = process.env.S3_BUCKET;
    const cdnDomain = process.env.CDN_DOMAIN?.replace(/^https?:\/\//, '');

    if (image.src && s3Bucket) {
      const s3Key = extractS3KeyFromImageSrc(image.src, cdnDomain);

      if (s3Key) {
        await deleteS3Object(s3Bucket, s3Key);
      }
    }

    // Delete from database
    await ImageRepository.delete(imageId);

    // Log image deletion for security audit
    logSecurityEvent({
      event: 'media.release.image.deleted',
      userId: session.user.id,
      metadata: {
        imageId,
        releaseId: image.releaseId,
        success: true,
      },
    });

    // Revalidate paths
    revalidatePath('/releases');
    revalidatePath('/admin/releases');

    return { success: true };
  } catch (error) {
    logger.error('Delete release image action error', error);
    return { success: false, error: 'Failed to delete image', code: 'UNKNOWN' };
  }
};

/**
 * Server action to get images for a release
 */
export const getReleaseImagesAction = async (
  releaseId: string
): Promise<ImageUploadActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  try {
    const images = await ImageRepository.findListingByRelease(releaseId);

    return { success: true, data: images.map(toImageUploadResult) };
  } catch (error) {
    logger.error('Get release images action error', error);
    return { success: false, error: 'Failed to retrieve images' };
  }
};

/**
 * Server action to update image metadata
 */
export const updateReleaseImageAction = async (
  imageId: string,
  data: { caption?: string; altText?: string }
): Promise<AdminActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  try {
    await ImageRepository.updateMetadata(imageId, data);

    revalidatePath('/releases');
    return { success: true };
  } catch (error) {
    logger.error('Update release image action error', error);
    return { success: false, error: 'Failed to update image', code: 'UNKNOWN' };
  }
};

/**
 * Server action to reorder images for a release
 * @param releaseId - The release ID
 * @param imageIds - Array of image IDs in the desired order
 */
export const reorderReleaseImagesAction = async (
  releaseId: string,
  imageIds: string[]
): Promise<ImageUploadActionResult> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }
  const { session } = gate;

  try {
    if (!imageIds || imageIds.length === 0) {
      return { success: false, error: 'No image IDs provided' };
    }

    await ImageRepository.reorder(imageIds);

    const images = await ImageRepository.findListingByRelease(releaseId);

    // Log image reorder for security audit
    logSecurityEvent({
      event: 'media.release.images.reordered',
      userId: session.user.id,
      metadata: {
        releaseId,
        imageCount: imageIds.length,
        success: true,
      },
    });

    // Revalidate paths
    revalidatePath('/releases');
    revalidatePath('/admin/releases');

    return {
      success: true,
      data: images.map(toImageUploadResult),
    };
  } catch (error) {
    logger.error('Reorder release images action error', error);
    return { success: false, error: 'Failed to reorder images' };
  }
};
