/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import type { ImageItem } from './image-uploader-types';

interface UseImageUploaderActionsParams {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  onReorder?: (imageIds: string[]) => Promise<void>;
  onDelete?: (imageId: string) => Promise<{ success: boolean; error?: string }>;
}

interface UseImageUploaderActions {
  sensors: ReturnType<typeof useSensors>;
  isReordering: boolean;
  isDeleting: boolean;
  /** Convenience flag: either reordering or deleting is in progress. */
  isBusy: boolean;
  previewImage: ImageItem | null;
  imageToDelete: ImageItem | null;
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  handlePreview: (item: ImageItem) => void;
  handleClosePreview: () => void;
  handleDeleteRequest: (item: ImageItem) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;
}

/**
 * Persists the new order of uploaded images via `onReorder`, swallowing failures
 * (the local reorder has already been applied). No-op when there is nothing to
 * persist.
 */
const persistReorder = async (
  updatedImages: ImageItem[],
  onReorder: ((imageIds: string[]) => Promise<void>) | undefined,
  setIsReordering: (value: boolean) => void
): Promise<void> => {
  if (!onReorder) return;

  const uploadedImageIds = updatedImages.filter((img) => img.uploadedUrl).map((img) => img.id);
  if (uploadedImageIds.length === 0) return;

  setIsReordering(true);
  try {
    await onReorder(uploadedImageIds);
  } catch (error) {
    console.error('Failed to persist image order:', error);
  } finally {
    setIsReordering(false);
  }
};

/**
 * Bundles the image uploader's drag-to-reorder sensors/handler, the preview
 * dialog state, and the delete confirmation state machine (including the
 * optional server-side delete via `onDelete` and blob URL cleanup).
 */
export const useImageUploaderActions = ({
  images,
  onImagesChange,
  onReorder,
  onDelete,
}: UseImageUploaderActionsParams): UseImageUploaderActions => {
  const [isReordering, setIsReordering] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
  const [imageToDelete, setImageToDelete] = useState<ImageItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = images.findIndex((item) => item.id === active.id);
      const newIndex = images.findIndex((item) => item.id === over.id);
      const reorderedImages = arrayMove(images, oldIndex, newIndex);

      const updatedImages = reorderedImages.map((img, index) => ({ ...img, sortOrder: index }));
      onImagesChange(updatedImages);

      await persistReorder(updatedImages, onReorder, setIsReordering);
    },
    [images, onImagesChange, onReorder]
  );

  const handlePreview = useCallback((item: ImageItem) => setPreviewImage(item), []);
  const handleClosePreview = useCallback(() => setPreviewImage(null), []);
  const handleDeleteRequest = useCallback((item: ImageItem) => setImageToDelete(item), []);
  const handleCancelDelete = useCallback(() => setImageToDelete(null), []);

  const handleConfirmDelete = useCallback(async () => {
    if (!imageToDelete) return;

    if (imageToDelete.uploadedUrl && onDelete) {
      setIsDeleting(true);
      try {
        const result = await onDelete(imageToDelete.id);
        if (!result.success) {
          console.error('Failed to delete image from server:', result.error);
        }
      } catch (error) {
        console.error('Error deleting image from server:', error);
      } finally {
        setIsDeleting(false);
      }
    }

    if (imageToDelete.preview && !imageToDelete.uploadedUrl) {
      URL.revokeObjectURL(imageToDelete.preview);
    }

    onImagesChange(images.filter((item) => item.id !== imageToDelete.id));
    setImageToDelete(null);
  }, [imageToDelete, images, onImagesChange, onDelete]);

  return {
    sensors,
    isReordering,
    isDeleting,
    isBusy: isReordering || isDeleting,
    previewImage,
    imageToDelete,
    handleDragEnd,
    handlePreview,
    handleClosePreview,
    handleDeleteRequest,
    handleCancelDelete,
    handleConfirmDelete,
  };
};
