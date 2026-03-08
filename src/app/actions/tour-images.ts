/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { revalidatePath } from 'next/cache';

import { ImageRepository } from '@/lib/repositories/tours/image-repository';
import { ImageUploadService } from '@/lib/services/tours/image-upload-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import {
  confirmUploadSchema,
  deleteImageSchema,
  imageReorderSchema,
  imageUploadRequestSchema,
  MAX_IMAGES_PER_TOUR,
  updateImageAltTextSchema,
  type ConfirmUploadRequest,
  type DeleteImageRequest,
  type ImageMetadata,
  type ImageReorder,
  type ImageUploadRequest,
  type PresignedUrlResponse,
  type UpdateImageAltText,
} from '@/lib/validations/tours/image-schema';

export interface TourImageActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Generate a presigned URL for uploading an image to S3
 * Requires admin role
 */
export async function generateUploadUrlAction(
  request: ImageUploadRequest
): Promise<TourImageActionResponse<PresignedUrlResponse>> {
  try {
    // Require admin authentication
    await requireRole('admin');

    // Validate request
    const validated = imageUploadRequestSchema.parse(request);

    // Check max images limit
    const existingCount = await ImageRepository.count(validated.tourId);
    if (existingCount >= MAX_IMAGES_PER_TOUR) {
      return {
        success: false,
        error: `Maximum of ${MAX_IMAGES_PER_TOUR} images per tour exceeded`,
      };
    }

    // Generate presigned URL
    const result = await ImageUploadService.generatePresignedUploadUrl(validated);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch (error) {
    console.error('Error generating upload URL:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to generate upload URL' };
  }
}

/**
 * Confirm image upload by creating TourImage database record
 * Call this after successful client-side upload to S3
 * Requires admin role
 */
export async function confirmUploadAction(
  uploadData: ConfirmUploadRequest
): Promise<TourImageActionResponse<ImageMetadata>> {
  try {
    // Require admin authentication
    const session = await requireRole('admin');

    // Validate metadata
    const validated = confirmUploadSchema.parse(uploadData);

    // Get next display order
    const existingImages = await ImageRepository.findByTourId(validated.tourId);
    const nextDisplayOrder = existingImages.length;

    // Generate CDN URL from S3 key
    const cdnUrl = ImageUploadService.generateCdnUrl(validated.s3Key);

    // Create TourImage record
    const tourImage = await ImageRepository.create({
      tourId: validated.tourId,
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

    // Revalidate tour pages
    revalidatePath(`/admin/tours/${validated.tourId}`);
    revalidatePath(`/tours/${validated.tourId}`);
    revalidatePath('/tours');

    return {
      success: true,
      data: {
        id: tourImage.id,
        tourId: tourImage.tourId,
        s3Key: tourImage.s3Key,
        s3Url: tourImage.s3Url,
        s3Bucket: tourImage.s3Bucket,
        fileName: tourImage.fileName,
        fileSize: tourImage.fileSize,
        mimeType: tourImage.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        displayOrder: tourImage.displayOrder,
        altText: tourImage.altText || undefined,
        uploadedBy: tourImage.uploadedBy || undefined,
      },
    };
  } catch (error) {
    console.error('Error confirming upload:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to confirm upload' };
  }
}

/**
 * Delete an image from tour (removes from S3 and database)
 * Requires admin role
 */
export async function deleteImageAction(
  request: DeleteImageRequest
): Promise<TourImageActionResponse<void>> {
  try {
    // Require admin authentication
    await requireRole('admin');

    // Validate request
    const validated = deleteImageSchema.parse(request);

    // Get image details
    const image = await ImageRepository.findById(validated.imageId);

    if (!image) {
      return { success: false, error: 'Image not found' };
    }

    // Verify image belongs to tour
    if (image.tourId !== validated.tourId) {
      return { success: false, error: 'Image does not belong to specified tour' };
    }

    // Delete from S3
    const s3Result = await ImageUploadService.deleteFromS3(image.s3Key);
    if (!s3Result.success) {
      console.error('Failed to delete from S3:', s3Result.error);
      // Continue with database deletion even if S3 delete fails
    }

    // Delete from database
    await ImageRepository.delete(validated.imageId);

    // Revalidate tour pages
    revalidatePath(`/admin/tours/${validated.tourId}`);
    revalidatePath(`/tours/${validated.tourId}`);
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error deleting image:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to delete image' };
  }
}

/**
 * Reorder images for a tour
 * Requires admin role
 */
export async function reorderImagesAction(
  request: ImageReorder
): Promise<TourImageActionResponse<void>> {
  try {
    // Require admin authentication
    await requireRole('admin');

    // Validate request
    const validated = imageReorderSchema.parse(request);

    // Verify all images belong to the tour
    const images = await ImageRepository.findByTourId(validated.tourId);
    const imageIds = new Set(images.map((img) => img.id));

    for (const order of validated.imageOrders) {
      if (!imageIds.has(order.id)) {
        return {
          success: false,
          error: `Image ${order.id} does not belong to tour ${validated.tourId}`,
        };
      }
    }

    // Reorder images in transaction
    await ImageRepository.reorderImages(validated.imageOrders);

    // Revalidate tour pages
    revalidatePath(`/admin/tours/${validated.tourId}`);
    revalidatePath(`/tours/${validated.tourId}`);
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error reordering images:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to reorder images' };
  }
}

/**
 * Update alt text for an image
 * Requires admin role
 */
export async function updateImageAltTextAction(
  request: UpdateImageAltText
): Promise<TourImageActionResponse<void>> {
  try {
    // Require admin authentication
    await requireRole('admin');

    // Validate request
    const validated = updateImageAltTextSchema.parse(request);

    // Get image to find tour ID for revalidation
    const image = await ImageRepository.findById(validated.imageId);

    if (!image) {
      return { success: false, error: 'Image not found' };
    }

    // Update alt text
    await ImageRepository.updateAltText(validated.imageId, validated.altText || null);

    // Revalidate tour pages
    revalidatePath(`/admin/tours/${image.tourId}`);
    revalidatePath(`/tours/${image.tourId}`);
    revalidatePath('/tours');

    return { success: true };
  } catch (error) {
    console.error('Error updating alt text:', error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Failed to update alt text' };
  }
}
