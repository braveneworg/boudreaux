/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { ImageUploader, type ImageItem } from '@/app/components/ui/image-uploader';
import {
  confirmTourDateUploadAction,
  confirmUploadAction,
  deleteImageAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  generateUploadUrlAction,
  reorderImagesAction,
  reorderTourDateImagesAction,
} from '@/lib/actions/tours/tour-images';
import { error as logError } from '@/lib/utils/console-logger';
import {
  MAX_FILE_SIZE,
  MAX_IMAGES_PER_TOUR,
  MAX_IMAGES_PER_TOUR_DATE,
  SUPPORTED_IMAGE_TYPES,
  type SupportedImageType,
} from '@/lib/validation/tours/image-schema';

import {
  markImageError,
  markImagesUploading,
  markImageUploaded,
  setImageProgress,
  uploadImageToS3,
  type ConfirmedUpload,
  type ImageActionResult,
  type PresignedUploadTarget,
} from './image-upload-helpers';

/** What a tour image belongs to: a Tour, or one of its tour dates. */
export interface TourImageOwnerRef {
  kind: 'tour' | 'tourDate';
  id: string;
}

/** A stored image, as the images routes return it; only these fields are read. */
export interface StoredTourImage {
  id: string;
  s3Url: string;
  fileName: string;
  altText: string | null;
  displayOrder: number;
}

export interface TourImageUploadProps {
  /** The tour or tour date the images belong to */
  owner: TourImageOwnerRef;
  /** Initial images from database */
  initialImages?: StoredTourImage[];
  /** Called when images are successfully uploaded */
  onUploadComplete?: () => void;
  /** Whether the component is disabled */
  disabled?: boolean;
}

interface UploadFile {
  fileName: string;
  fileSize: number;
  mimeType: SupportedImageType;
}

/** The image actions and limits of one owner kind, keyed by the owner's id. */
interface OwnerImageActions {
  label: string;
  maxImages: number;
  generate: (
    ownerId: string,
    file: UploadFile
  ) => Promise<ImageActionResult<PresignedUploadTarget>>;
  confirm: (
    ownerId: string,
    upload: UploadFile & { s3Key: string; s3Bucket: string }
  ) => Promise<ImageActionResult<ConfirmedUpload>>;
  reorder: (
    ownerId: string,
    imageOrders: Array<{ id: string; displayOrder: number }>
  ) => Promise<ImageActionResult<void>>;
  remove: (ownerId: string, imageId: string) => Promise<ImageActionResult<void>>;
}

const TOUR_ACTIONS: OwnerImageActions = {
  label: 'Upload tour images',
  maxImages: MAX_IMAGES_PER_TOUR,
  generate: (tourId, file) => generateUploadUrlAction({ tourId, ...file }),
  confirm: (tourId, upload) => confirmUploadAction({ tourId, ...upload }),
  reorder: (tourId, imageOrders) => reorderImagesAction({ tourId, imageOrders }),
  remove: (tourId, imageId) => deleteImageAction({ imageId, tourId }),
};

const TOUR_DATE_ACTIONS: OwnerImageActions = {
  label: 'Upload tour date images',
  maxImages: MAX_IMAGES_PER_TOUR_DATE,
  generate: (tourDateId, file) => generateTourDateUploadUrlAction({ tourDateId, ...file }),
  confirm: (tourDateId, upload) => confirmTourDateUploadAction({ tourDateId, ...upload }),
  reorder: (tourDateId, imageOrders) => reorderTourDateImagesAction({ tourDateId, imageOrders }),
  remove: (tourDateId, imageId) => deleteTourDateImageAction({ imageId, tourDateId }),
};

const actionsFor = (kind: TourImageOwnerRef['kind']): OwnerImageActions =>
  kind === 'tour' ? TOUR_ACTIONS : TOUR_DATE_ACTIONS;

/** The upload fields of a picked file; the uploader only offers supported types. */
const uploadFileOf = (file: File): UploadFile => ({
  fileName: file.name,
  fileSize: file.size,
  mimeType: file.type as SupportedImageType,
});

/**
 * The image uploader for a Tour or a tour date: presigned S3 uploads,
 * drag-and-drop reorder and delete, through that owner's image actions.
 */
export const TourImageUpload = ({
  owner,
  initialImages = [],
  onUploadComplete,
  disabled = false,
}: TourImageUploadProps) => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const { kind, id: ownerId } = owner;
  const actions = actionsFor(kind);

  // Convert stored images to ImageItems whenever they (re)load
  useEffect(() => {
    if (initialImages.length > 0) {
      setImages(
        initialImages.map((img) => ({
          id: img.id,
          preview: img.s3Url,
          altText: img.altText || img.fileName,
          uploadedUrl: img.s3Url,
          sortOrder: img.displayOrder,
        }))
      );
    }
  }, [initialImages]);

  const handleUpload = useCallback(
    async (imagesToUpload: ImageItem[]) => {
      setImages((prev) => markImagesUploading(prev, imagesToUpload));

      for (const imageItem of imagesToUpload) {
        if (!imageItem.file) continue;

        try {
          const uploaded = await uploadImageToS3({
            imageItem,
            generateUrl: (file) => actionsFor(kind).generate(ownerId, uploadFileOf(file)),
            confirmUpload: (s3Key, s3Bucket, file) =>
              actionsFor(kind).confirm(ownerId, { s3Key, s3Bucket, ...uploadFileOf(file) }),
            onS3Uploaded: () => setImages((prev) => setImageProgress(prev, imageItem.id, 50)),
          });

          setImages((prev) => markImageUploaded(prev, imageItem.id, uploaded));

          if (imageItem.preview.startsWith('blob:')) {
            URL.revokeObjectURL(imageItem.preview);
          }
        } catch (uploadError) {
          logError('Tour image upload failed:', uploadError);
          const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
          setImages((prev) => markImageError(prev, imageItem.id, message));
        }
      }

      onUploadComplete?.();
    },
    [kind, ownerId, onUploadComplete]
  );

  /** Persist a new order; a refusal rejects so the uploader rolls back. */
  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      const imageOrders = imageIds.map((id, index) => ({ id, displayOrder: index }));
      const result = await actionsFor(kind).reorder(ownerId, imageOrders);

      if (!result.success) {
        logError('Failed to reorder tour images:', result.error);
        throw new Error(result.error || 'Failed to reorder images');
      }
    },
    [kind, ownerId]
  );

  const handleDelete = useCallback(
    async (imageId: string) => {
      const result = await actionsFor(kind).remove(ownerId, imageId);

      if (!result.success) {
        logError('Failed to delete tour image:', result.error);
      }

      return result;
    },
    [kind, ownerId]
  );

  return (
    <ImageUploader
      images={images}
      onImagesChange={setImages}
      onUpload={handleUpload}
      onReorder={handleReorder}
      onDelete={handleDelete}
      maxImages={actions.maxImages}
      maxFileSize={MAX_FILE_SIZE}
      acceptedTypes={[...SUPPORTED_IMAGE_TYPES]}
      disabled={disabled}
      label={actions.label}
    />
  );
};
