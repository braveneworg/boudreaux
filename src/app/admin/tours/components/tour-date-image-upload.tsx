/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import {
  confirmTourDateUploadAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  reorderTourDateImagesAction,
} from '@/lib/actions/tours/tour-date-images';
import { MAX_FILE_SIZE, SUPPORTED_IMAGE_TYPES } from '@/lib/validation/tours/image-schema';
import { MAX_IMAGES_PER_TOUR_DATE } from '@/lib/validation/tours/tour-date-image-schema';

import {
  markImageError,
  markImagesUploading,
  markImageUploaded,
  setImageProgress,
  uploadImageToS3,
} from './image-upload-helpers';

/** Narrows a File's MIME type to the supported image union expected by the actions. */
type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Local interface matching Prisma TourDateImage model.
 * Client components do not import the generated Prisma client types directly.
 */
interface TourDateImageFields {
  id: string;
  tourDateId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  displayOrder: number;
  altText: string | null;
  createdAt: Date;
  uploadedBy: string | null;
}

export interface TourDateImageUploadProps {
  /** Tour date ID to associate images with */
  tourDateId: string;
  /** Initial images from database */
  initialImages?: TourDateImageFields[];
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
      setImages((prev) => markImagesUploading(prev, imagesToUpload));

      for (const imageItem of imagesToUpload) {
        if (!imageItem.file) continue;

        try {
          const uploaded = await uploadImageToS3({
            imageItem,
            generateUrl: (file) =>
              generateTourDateUploadUrlAction({
                tourDateId,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type as SupportedMimeType,
              }),
            confirmUpload: (s3Key, s3Bucket, file) =>
              confirmTourDateUploadAction({
                tourDateId,
                s3Key,
                s3Bucket,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type as SupportedMimeType,
              }),
            // Update progress to 50% after S3 upload
            onS3Uploaded: () => setImages((prev) => setImageProgress(prev, imageItem.id, 50)),
          });

          // Update to completed state with server-provided URL
          setImages((prev) => markImageUploaded(prev, imageItem.id, uploaded));

          // Revoke blob URL after successful upload
          if (imageItem.preview.startsWith('blob:')) {
            URL.revokeObjectURL(imageItem.preview);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          console.error('Tour date image upload error:', error);

          // Update to error state
          setImages((prev) => markImageError(prev, imageItem.id, errorMessage));
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
