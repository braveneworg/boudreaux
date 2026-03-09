/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { revalidatePath } from 'next/cache';

import { TourDateImageRepository } from '@/lib/repositories/tours/tour-date-image-repository';
import { ImageUploadService } from '@/lib/services/tours/image-upload-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import type { PresignedUrlResponse } from '@/lib/validations/tours/image-schema';
import {
  MAX_IMAGES_PER_TOUR_DATE,
  tourDateConfirmUploadSchema,
  tourDateDeleteImageSchema,
  tourDateImageReorderSchema,
  tourDateImageUploadRequestSchema,
  tourDateUpdateImageAltTextSchema,
  type TourDateConfirmUploadRequest,
  type TourDateDeleteImageRequest,
  type TourDateImageMetadata,
  type TourDateImageReorder,
  type TourDateImageUploadRequest,
  type TourDateUpdateImageAltText,
} from '@/lib/validations/tours/tour-date-image-schema';

export interface TourDateImageActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Generate a presigned URL for uploading a tour date image to S3
 * Requires admin role
 */
export async function generateTourDateUploadUrlAction(
  request: TourDateImageUploadRequest
): Promise<TourDateImageActionResponse<PresignedUrlResponse>> {
  try {
    await requireRole('admin');

    const validated = tourDateImageUploadRequestSchema.parse(request);

    // Check max images limit
    const existingCount = await TourDateImageRepository.count(validated.tourDateId);
    if (existingCount >= MAX_IMAGES_PER_TOUR_DATE) {
      return {
        success: false,
        error: `Maximum of ${MAX_IMAGES_PER_TOUR_DATE} images per tour date exceeded`,
      };
    }

    const result = await ImageUploadService.generateTourDatePresignedUploadUrl(validated);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch (error) {
    console.error('Error generating tour date upload URL:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to generate upload URL' };
  }
}

/**
 * Confirm tour date image upload by creating TourDateImage database record
 * Call this after successful client-side upload to S3
 * Requires admin role
 */
export async function confirmTourDateUploadAction(
  uploadData: TourDateConfirmUploadRequest
): Promise<TourDateImageActionResponse<TourDateImageMetadata>> {
  try {
    const session = await requireRole('admin');

    const validated = tourDateConfirmUploadSchema.parse(uploadData);

    // Get next display order
    const existingImages = await TourDateImageRepository.findByTourDateId(validated.tourDateId);
    const nextDisplayOrder = existingImages.length;

    // Generate CDN URL from S3 key
    const cdnUrl = ImageUploadService.generateCdnUrl(validated.s3Key);

    // Create TourDateImage record
    const tourDateImage = await TourDateImageRepository.create({
      tourDateId: validated.tourDateId,
      s3Key: validated.s3Key,
      s3Url: cdnUrl,
      s3Bucket: validated.s3Bucket,
      fileName: validated.fileName,
      fileSize: validated.fileSize,
      mimeType: validated.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
      displayOrder: nextDisplayOrder,
      altText: validated.altText,
      uploadedBy: session.user.id,
    });

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return {
      success: true,
      data: {
        id: tourDateImage.id,
        tourDateId: tourDateImage.tourDateId,
        s3Key: tourDateImage.s3Key,
        s3Url: tourDateImage.s3Url,
        s3Bucket: tourDateImage.s3Bucket,
        fileName: tourDateImage.fileName,
        fileSize: tourDateImage.fileSize,
        mimeType: tourDateImage.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        displayOrder: tourDateImage.displayOrder,
        altText: tourDateImage.altText || undefined,
        uploadedBy: tourDateImage.uploadedBy || undefined,
      },
    };
  } catch (error) {
    console.error('Error confirming tour date upload:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to confirm upload' };
  }
}

/**
 * Delete a tour date image (removes from S3 and database)
 * Requires admin role
 */
export async function deleteTourDateImageAction(
  request: TourDateDeleteImageRequest
): Promise<TourDateImageActionResponse<void>> {
  try {
    await requireRole('admin');

    const validated = tourDateDeleteImageSchema.parse(request);

    // Get image details
    const image = await TourDateImageRepository.findById(validated.imageId);

    if (!image) {
      return { success: false, error: 'Image not found' };
    }

    // Verify image belongs to tour date
    if (image.tourDateId !== validated.tourDateId) {
      return { success: false, error: 'Image does not belong to specified tour date' };
    }

    // Delete from S3
    const s3Result = await ImageUploadService.deleteFromS3(image.s3Key);
    if (!s3Result.success) {
      console.error('Failed to delete from S3:', s3Result.error);
      // Continue with database deletion even if S3 delete fails
    }

    // Delete from database
    await TourDateImageRepository.delete(validated.imageId);

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error deleting tour date image:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to delete image' };
  }
}

/**
 * Reorder images for a tour date
 * Requires admin role
 */
export async function reorderTourDateImagesAction(
  request: TourDateImageReorder
): Promise<TourDateImageActionResponse<void>> {
  try {
    await requireRole('admin');

    const validated = tourDateImageReorderSchema.parse(request);

    // Verify all images belong to the tour date
    const images = await TourDateImageRepository.findByTourDateId(validated.tourDateId);
    const imageIds = new Set(images.map((img) => img.id));

    for (const order of validated.imageOrders) {
      if (!imageIds.has(order.id)) {
        return {
          success: false,
          error: `Image ${order.id} does not belong to tour date ${validated.tourDateId}`,
        };
      }
    }

    // Reorder images in transaction
    await TourDateImageRepository.reorderImages(validated.imageOrders);

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error reordering tour date images:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to reorder images' };
  }
}

/**
 * Update alt text for a tour date image
 * Requires admin role
 */
export async function updateTourDateImageAltTextAction(
  request: TourDateUpdateImageAltText
): Promise<TourDateImageActionResponse<void>> {
  try {
    await requireRole('admin');

    const validated = tourDateUpdateImageAltTextSchema.parse(request);

    // Get image to verify it exists
    const image = await TourDateImageRepository.findById(validated.imageId);

    if (!image) {
      return { success: false, error: 'Image not found' };
    }

    // Update alt text
    await TourDateImageRepository.updateAltText(validated.imageId, validated.altText || null);

    // Revalidate paths
    revalidatePath('/admin/tours');
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error updating tour date image alt text:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to update alt text' };
  }
}
