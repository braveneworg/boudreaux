'use server';

import { revalidatePath } from 'next/cache';

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

/**
 * S3 client configuration
 */
const getS3Client = () => {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
};

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
export const deleteReleaseImageAction = async (
  imageId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
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
    const cdnDomainRaw = process.env.CDN_DOMAIN;
    const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

    if (image.src && s3Bucket) {
      let s3Key: string | null = null;

      if (cdnDomain && image.src.includes(cdnDomain)) {
        s3Key = image.src.replace(/^(https?:\/\/)+/, '').replace(`${cdnDomain}/`, '');
      } else if (image.src.includes('.s3.')) {
        const urlParts = image.src.split('.s3.');
        if (urlParts[1]) {
          const keyPart = urlParts[1].split('/').slice(1).join('/');
          s3Key = keyPart;
        }
      }

      if (s3Key) {
        try {
          const s3Client = getS3Client();
          const deleteCommand = new DeleteObjectCommand({
            Bucket: s3Bucket,
            Key: s3Key,
          });
          await s3Client.send(deleteCommand);
        } catch (s3Error) {
          console.error('S3 delete error (continuing with DB delete):', s3Error);
        }
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
    console.error('Delete release image action error:', error);
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
      data: images.map((img) => ({
        id: img.id,
        src: img.src || '',
        caption: img.caption || undefined,
        altText: img.altText || undefined,
        sortOrder: img.sortOrder ?? 0,
      })),
    };
  } catch (error) {
    console.error('Get release images action error:', error);
    return { success: false, error: 'Failed to retrieve images' };
  }
};

/**
 * Server action to update image metadata
 */
export const updateReleaseImageAction = async (
  imageId: string,
  data: { caption?: string; altText?: string }
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
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
    console.error('Update release image action error:', error);
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

    if (!session?.user?.id || session?.user?.role !== 'admin') {
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
      data: images.map((img) => ({
        id: img.id,
        src: img.src || '',
        caption: img.caption || undefined,
        altText: img.altText || undefined,
        sortOrder: img.sortOrder ?? 0,
      })),
    };
  } catch (error) {
    console.error('Reorder release images action error:', error);
    return { success: false, error: 'Failed to reorder images' };
  }
};
