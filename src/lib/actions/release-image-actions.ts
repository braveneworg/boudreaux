/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { logSecurityEvent } from '@/utils/audit-log';

import { isAdminSession } from './image-action-auth';
import { deleteS3Object, extractS3KeyFromImageSrc } from './release-image-actions-helpers';

import type { AdminActionResult } from './run-admin-entity-action';

const logger = loggers.s3;

/**
 * Result type for image upload actions
 */
export interface ImageUploadActionResult {
  success: boolean;
  data?: {
    id: string;
    src: string;
    caption?: string;
    altText?: string;
    sortOrder: number;
  }[];
  error?: string;
}

/**
 * Server action to delete a release image
 */
export const deleteReleaseImageAction = async (imageId: string): Promise<AdminActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!isAdminSession(session)) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get the image to find the src URL
    const image = await prisma.image.findUnique({
      where: { id: imageId },
      select: { id: true, src: true, releaseId: true },
    });

    if (!image) {
      return { success: false, error: 'Image not found' };
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
    await prisma.image.delete({
      where: { id: imageId },
    });

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
    revalidatePath(`/releases/[slug]`, 'page');
    revalidatePath('/admin/releases');

    return { success: true };
  } catch (error) {
    logger.error('Delete release image action error', error);
    return { success: false, error: 'Failed to delete image' };
  }
};

/**
 * Server action to get images for a release
 */
export const getReleaseImagesAction = async (
  releaseId: string
): Promise<ImageUploadActionResult> => {
  try {
    const images = await prisma.image.findMany({
      where: { releaseId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        src: true,
        caption: true,
        altText: true,
        sortOrder: true,
      },
    });

    return {
      success: true,
      data: images.map(
        (img: {
          id: string;
          src: string | null;
          caption: string | null;
          altText: string | null;
          sortOrder: number | null;
        }) => ({
          id: img.id,
          src: img.src || '',
          caption: img.caption || undefined,
          altText: img.altText || undefined,
          sortOrder: img.sortOrder ?? 0,
        })
      ),
    };
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
  await requireRole('admin');

  try {
    const session = await auth();

    if (!isAdminSession(session)) {
      return { success: false, error: 'Unauthorized' };
    }

    await prisma.image.update({
      where: { id: imageId },
      data: {
        caption: data.caption,
        altText: data.altText,
        updatedAt: new Date(),
      },
    });

    revalidatePath(`/releases/[slug]`, 'page');
    return { success: true };
  } catch (error) {
    logger.error('Update release image action error', error);
    return { success: false, error: 'Failed to update image' };
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
  await requireRole('admin');

  try {
    const session = await auth();

    if (!isAdminSession(session)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!imageIds || imageIds.length === 0) {
      return { success: false, error: 'No image IDs provided' };
    }

    // Update each image's sortOrder in a transaction
    await prisma.$transaction(
      imageIds.map((imageId, index) =>
        prisma.image.update({
          where: { id: imageId },
          data: { sortOrder: index },
        })
      )
    );

    // Get updated images
    const images = await prisma.image.findMany({
      where: { releaseId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        src: true,
        caption: true,
        altText: true,
        sortOrder: true,
      },
    });

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
    revalidatePath(`/releases/[slug]`, 'page');
    revalidatePath('/admin/releases');

    return {
      success: true,
      data: images.map(
        (img: {
          id: string;
          src: string | null;
          caption: string | null;
          altText: string | null;
          sortOrder: number | null;
        }) => ({
          id: img.id,
          src: img.src || '',
          caption: img.caption || undefined,
          altText: img.altText || undefined,
          sortOrder: img.sortOrder ?? 0,
        })
      ),
    };
  } catch (error) {
    logger.error('Reorder release images action error', error);
    return { success: false, error: 'Failed to reorder images' };
  }
};
