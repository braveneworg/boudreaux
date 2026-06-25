/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';

import { toast } from 'sonner';

import { type ImageItem } from '@/app/components/ui/image-uploader';
import { type RegisterImageResult } from '@/lib/actions/register-image-actions';
import { error } from '@/lib/utils/console-logger';

import {
  type ImageUploadEntityType,
  type RegisterImagesAction,
  markImagesUploadError,
  markImagesUploading,
  mergeUploadedImages,
  mergeUploadedImagesByIndex,
  uploadAndRegisterImages,
} from '../utils/upload-images';

/** Result returned by the reorder/delete image server actions. */
interface ImageActionResult {
  success: boolean;
  error?: string;
}

type ReorderImagesAction = (entityId: string, imageIds: string[]) => Promise<ImageActionResult>;
type DeleteImageAction = (imageId: string) => Promise<ImageActionResult>;

interface UseImageOperationsOptions {
  entityType: ImageUploadEntityType;
  /** The persisted entity id once it exists (null before create succeeds). */
  entityId: string | null;
  reorderAction: ReorderImagesAction;
  deleteAction: DeleteImageAction;
  initialImages?: ImageItem[];
}

/** Options for a single image-upload run, supplying the entity-specific bits. */
export interface UploadImagesOptions {
  register: RegisterImagesAction;
  onSuccess: (uploaded: RegisterImageResult[]) => void;
  onError?: () => void;
  /** `counter` (default) skips already-uploaded images; `by-index` matches array index. */
  mergeStrategy?: 'counter' | 'by-index';
}

export interface UseImageOperationsReturn {
  images: ImageItem[];
  setImages: Dispatch<SetStateAction<ImageItem[]>>;
  isUploadingImages: boolean;
  imagesReordered: boolean;
  hasPendingImages: boolean;
  resetImagesReordered: () => void;
  handleImagesChange: (newImages: ImageItem[]) => void;
  handleReorder: (imageIds: string[]) => Promise<void>;
  handleDeleteImage: (imageId: string) => Promise<ImageActionResult>;
  uploadImages: (
    imagesToUpload: ImageItem[],
    targetId: string,
    options: UploadImagesOptions
  ) => Promise<void>;
}

interface RunUploadContext {
  setImages: Dispatch<SetStateAction<ImageItem[]>>;
  setIsUploadingImages: Dispatch<SetStateAction<boolean>>;
  entityType: ImageUploadEntityType;
}

const merge = (
  images: ImageItem[],
  uploaded: RegisterImageResult[],
  strategy: 'counter' | 'by-index'
): ImageItem[] =>
  strategy === 'by-index'
    ? mergeUploadedImagesByIndex(images, uploaded)
    : mergeUploadedImages(images, uploaded);

/**
 * Stateful image-upload run shared by both forms: flag pending images, drive the
 * presigned → S3 → register pipeline, then either merge the results (success) or
 * record the error and toast (failure). Side effects flow through the passed-in
 * setters so the hook body stays small.
 */
const runUpload = async (
  ctx: RunUploadContext,
  imagesToUpload: ImageItem[],
  targetId: string,
  { register, onSuccess, onError, mergeStrategy = 'counter' }: UploadImagesOptions
): Promise<void> => {
  ctx.setIsUploadingImages(true);
  ctx.setImages(markImagesUploading);

  try {
    const result = await uploadAndRegisterImages(imagesToUpload, {
      entityType: ctx.entityType,
      targetId,
      register,
    });

    if (result.success && result.data) {
      const uploaded = result.data;
      ctx.setImages((prev) => merge(prev, uploaded, mergeStrategy));
      onSuccess(uploaded);
    } else {
      throw Error(result.error || 'Failed to register images');
    }
  } catch (uploadError) {
    error('Image upload error:', uploadError);
    const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
    ctx.setImages((prev) => markImagesUploadError(prev, message));
    toast.error(message);
    onError?.();
  } finally {
    ctx.setIsUploadingImages(false);
  }
};

/**
 * Owns the image-uploader state both the release and artist forms share: the
 * image list, upload-in-flight flag, reorder dirtiness, and the presigned-URL
 * upload flow. Reorder/delete persistence is delegated to the entity-specific
 * server actions passed in `options`.
 */
export const useImageOperations = ({
  entityType,
  entityId,
  reorderAction,
  deleteAction,
  initialImages = [],
}: UseImageOperationsOptions): UseImageOperationsReturn => {
  const [images, setImages] = useState<ImageItem[]>(initialImages);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imagesReordered, setImagesReordered] = useState(false);

  const handleImagesChange = useCallback((newImages: ImageItem[]) => setImages(newImages), []);

  const handleReorder = useCallback(
    async (imageIds: string[]): Promise<void> => {
      setImagesReordered(true);
      if (!entityId) return;

      const result = await reorderAction(entityId, imageIds);
      if (!result.success) {
        toast.error(result.error || 'Failed to save image order');
      }
    },
    [entityId, reorderAction]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string): Promise<ImageActionResult> => {
      const result = await deleteAction(imageId);
      if (!result.success) {
        toast.error(result.error || 'Failed to delete image');
      }
      return result;
    },
    [deleteAction]
  );

  const uploadImages = useCallback(
    (imagesToUpload: ImageItem[], targetId: string, options: UploadImagesOptions) =>
      runUpload({ setImages, setIsUploadingImages, entityType }, imagesToUpload, targetId, options),
    [entityType]
  );

  return {
    images,
    setImages,
    isUploadingImages,
    imagesReordered,
    hasPendingImages: images.some((img) => img.file && !img.uploadedUrl),
    resetImagesReordered: useCallback(() => setImagesReordered(false), []),
    handleImagesChange,
    handleReorder,
    handleDeleteImage,
    uploadImages,
  };
};
