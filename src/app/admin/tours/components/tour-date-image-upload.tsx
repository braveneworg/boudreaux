/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  confirmTourDateUploadAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  reorderTourDateImagesAction,
} from '@/app/actions/tour-date-images';
import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import { MAX_FILE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/validations/tours/image-schema';
import { MAX_IMAGES_PER_TOUR_DATE } from '@/lib/validations/tours/tour-date-image-schema';

import type { TourDateImage } from '@prisma/client';

export interface TourDateImageUploadProps {
  /** Tour date ID to associate images with */
  tourDateId: string;
  /** Initial images from database */
  initialImages?: TourDateImage[];
  /** Called when images are successfully uploaded */
  onUploadComplete?: () => void;
  /** Whether the component is disabled */
  disabled?: boolean;
}

/**
 * Tour date-specific image uploader that integrates with TourDateImage Server Actions.
 * Uses presigned S3 URLs for direct uploads.
 */
export const TourDateImageUpload = ({
  tourDateId,
  initialImages = [],
  onUploadComplete,
  disabled = false,
}: TourDateImageUploadProps) => {
  const [images, setImages] = useState<ImageItem[]>([]);

  // Convert TourDateImages to ImageItems on mount
  useEffect(() => {
    if (initialImages.length > 0) {
      const convertedImages: ImageItem[] = initialImages.map((img) => ({
        id: img.id,
        preview: img.s3Url,
        altText: img.altText || img.fileName,
        uploadedUrl: img.s3Url,
        sortOrder: img.displayOrder,
      }));
      setImages(convertedImages);
    }
  }, [initialImages]);

  /**
   * Upload images via presigned URLs to S3
   */
  const handleUpload = useCallback(
    async (imagesToUpload: ImageItem[]) => {
      // Update images to show uploading state
      setImages((prev) =>
        prev.map((img) =>
          imagesToUpload.find((i) => i.id === img.id)
            ? { ...img, isUploading: true, uploadProgress: 0 }
            : img
        )
      );

      for (const imageItem of imagesToUpload) {
        if (!imageItem.file) continue;

        try {
          // Step 1: Get presigned URL from server
          const urlResult = await generateTourDateUploadUrlAction({
            tourDateId,
            fileName: imageItem.file.name,
            fileSize: imageItem.file.size,
            mimeType: imageItem.file.type as
              | 'image/jpeg'
              | 'image/png'
              | 'image/gif'
              | 'image/webp',
          });

          if (!urlResult.success || !urlResult.data) {
            throw new Error(urlResult.error || 'Failed to generate upload URL');
          }

          const { uploadUrl, s3Key, s3Bucket } = urlResult.data;

          // Step 2: Upload directly to S3
          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: imageItem.file,
            headers: {
              'Content-Type': imageItem.file.type,
            },
          });

          if (!uploadResponse.ok) {
            throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
          }

          // Update progress to 50% after S3 upload
          setImages((prev) =>
            prev.map((img) => (img.id === imageItem.id ? { ...img, uploadProgress: 50 } : img))
          );

          // Step 3: Confirm upload with server to create database record
          const confirmResult = await confirmTourDateUploadAction({
            tourDateId,
            s3Key,
            s3Bucket,
            fileName: imageItem.file.name,
            fileSize: imageItem.file.size,
            mimeType: imageItem.file.type as
              | 'image/jpeg'
              | 'image/png'
              | 'image/gif'
              | 'image/webp',
          });

          if (!confirmResult.success || !confirmResult.data) {
            throw new Error(confirmResult.error || 'Failed to confirm upload');
          }

          // Ensure id is present (it will be after database insert)
          const uploadedId = confirmResult.data.id;
          if (!uploadedId) {
            throw new Error('Server did not return image ID');
          }

          // Update to completed state with server-provided URL
          setImages((prev) =>
            prev.map((img) =>
              img.id === imageItem.id
                ? {
                    ...img,
                    id: uploadedId,
                    isUploading: false,
                    uploadProgress: 100,
                    uploadedUrl: confirmResult.data!.s3Url,
                    preview: confirmResult.data!.s3Url,
                    error: undefined,
                  }
                : img
            )
          );

          // Revoke blob URL after successful upload
          if (imageItem.preview.startsWith('blob:')) {
            URL.revokeObjectURL(imageItem.preview);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          console.error('Tour date image upload error:', error);

          // Update to error state
          setImages((prev) =>
            prev.map((img) =>
              img.id === imageItem.id ? { ...img, isUploading: false, error: errorMessage } : img
            )
          );
        }
      }

      // Call completion callback if provided
      if (onUploadComplete) {
        onUploadComplete();
      }
    },
    [tourDateId, onUploadComplete]
  );

  /**
   * Reorder images and persist to database
   */
  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      const imageOrders = imageIds.map((id, index) => ({
        id,
        displayOrder: index,
      }));

      const result = await reorderTourDateImagesAction({
        tourDateId,
        imageOrders,
      });

      if (!result.success) {
        console.error('Failed to reorder tour date images:', result.error);
        throw new Error(result.error || 'Failed to reorder images');
      }
    },
    [tourDateId]
  );

  /**
   * Delete image from S3 and database
   */
  const handleDelete = useCallback(
    async (imageId: string) => {
      const result = await deleteTourDateImageAction({
        imageId,
        tourDateId,
      });

      if (!result.success) {
        console.error('Failed to delete tour date image:', result.error);
      }

      return result;
    },
    [tourDateId]
  );

  return (
    <ImageUploader
      images={images}
      onImagesChange={setImages}
      onUpload={handleUpload}
      onReorder={handleReorder}
      onDelete={handleDelete}
      maxImages={MAX_IMAGES_PER_TOUR_DATE}
      maxFileSize={MAX_FILE_SIZE}
      acceptedTypes={[...SUPPORTED_IMAGE_TYPES]}
      disabled={disabled}
      label="Upload tour date images"
    />
  );
};
