/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useId } from 'react';

import { ImagePlus } from 'lucide-react';

import { cn } from '@/lib/utils';

import { ImageDeleteDialog, ImagePreviewDialog } from './image-uploader-dialogs';
import { ImageUploaderGrid } from './image-uploader-grid';
import {
  getPendingImages,
  hasUnuploadedImages,
  hasUploadingImage,
  imageUploaderStatusMessage,
  triggerImageUpload,
} from './image-uploader-utils';
import { UploaderDropZone } from './uploader-drop-zone';
import { UploaderStatusBanner } from './uploader-status-banner';
import { UploaderUploadButton } from './uploader-upload-button';
import { useImageUploaderActions } from './use-image-uploader-actions';
import { useImageUploaderFiles } from './use-image-uploader-files';
import { useUploaderDrag } from './use-uploader-drag';

import type { ImageItem, ImageUploaderProps } from './image-uploader-types';

export type { ImageItem, ImageUploaderProps };

/**
 * ImageUploader component for uploading and managing multiple images
 * with drag-and-drop reordering support.
 *
 * Mobile-first design with responsive grid layout.
 */
export const ImageUploader = ({
  images,
  onImagesChange,
  onUpload,
  onReorder,
  onDelete,
  maxImages = 10,
  maxFileSize = 20 * 1024 * 1024, // 20MB
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  disabled = false,
  className,
  label = 'Upload images',
}: ImageUploaderProps): React.JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const {
    sensors,
    isReordering,
    isDeleting,
    isBusy,
    previewImage,
    imageToDelete,
    handleDragEnd,
    handlePreview,
    handleClosePreview,
    handleDeleteRequest,
    handleCancelDelete,
    handleConfirmDelete,
  } = useImageUploaderActions({ images, onImagesChange, onReorder, onDelete });

  const { handleFiles, handleInputChange } = useImageUploaderFiles({
    images,
    onImagesChange,
    maxImages,
    maxFileSize,
    acceptedTypes,
    disabled,
    inputRef,
  });

  const { isDragOver, handleDrop, handleDragOver, handleDragLeave } = useUploaderDrag(handleFiles);

  const pendingImages = getPendingImages(images);
  const showUploadButton = Boolean(onUpload) && hasUnuploadedImages(images);
  const isUploading = hasUploadingImage(images);
  const isDisabled = disabled || isBusy;

  return (
    <div className={cn('space-y-4', className)}>
      <UploaderStatusBanner message={imageUploaderStatusMessage(isReordering, isDeleting)} />

      <UploaderDropZone
        inputRef={inputRef}
        inputId={inputId}
        accept={acceptedTypes.join(',')}
        multiple
        onChange={handleInputChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        label={label}
        isDragOver={isDragOver}
        isDisabled={isDisabled}
        disabled={disabled}
        currentCount={images.length}
        maxCount={maxImages}
        countUnit="images"
        containerClassName="min-h-32 p-4"
        icon={<ImagePlus className="mb-2 h-8 w-8 text-zinc-950" />}
        acceptedTypesLabel={acceptedTypes.map((t) => t.replace('image/', '')).join(', ')}
        maxSizeMb={Math.round(maxFileSize / 1024 / 1024)}
        maxReachedLabel={<>Maximum {maxImages} images reached</>}
      />

      <ImageUploaderGrid
        images={images}
        sensors={sensors}
        isReordering={isReordering}
        isDisabled={isDisabled}
        onDragEnd={handleDragEnd}
        onDeleteRequest={handleDeleteRequest}
        onPreview={handlePreview}
      />

      {showUploadButton && (
        <UploaderUploadButton
          onClick={() => triggerImageUpload(images, onUpload)}
          disabled={isDisabled || isUploading}
          isUploading={isUploading}
          pendingCount={pendingImages.length}
          noun="Images"
        />
      )}

      <ImagePreviewDialog previewImage={previewImage} onClose={handleClosePreview} />

      <ImageDeleteDialog
        imageToDelete={imageToDelete}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
