/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useRef } from 'react';

import { cn } from '@/lib/utils';

import { MediaUploaderDeleteDialog } from './media-uploader-delete-dialog';
import { MediaUploadIcon, MediaUploaderList } from './media-uploader-list';
import {
  ALL_MEDIA_FILE_TYPES,
  AUDIO_FILE_TYPES,
  VIDEO_FILE_TYPES,
  type MediaItem,
  type MediaType,
  type MediaUploaderProps,
} from './media-uploader-types';
import {
  getAcceptedTypesDisplay,
  getMediaUploaderFlags,
  mediaUploaderStatusMessage,
  resolveAcceptedTypes,
  triggerMediaUpload,
} from './media-uploader-utils';
import { UploaderDropZone } from './uploader-drop-zone';
import { UploaderStatusBanner } from './uploader-status-banner';
import { UploaderUploadButton } from './uploader-upload-button';
import { useMediaUploaderActions } from './use-media-uploader-actions';
import { useMediaUploaderFiles } from './use-media-uploader-files';
import { useUploaderDrag } from './use-uploader-drag';

export { ALL_MEDIA_FILE_TYPES, AUDIO_FILE_TYPES, VIDEO_FILE_TYPES };
export type { MediaItem, MediaType, MediaUploaderProps };

/**
 * MediaUploader component for uploading and managing audio/video files.
 *
 * Supports multiple audio and video formats for track uploads.
 */
export const MediaUploader = ({
  mediaItems,
  onMediaChange,
  onUpload,
  onDelete,
  mediaType = 'all',
  maxFiles = 10,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  multiple = true,
  disabled = false,
  className,
  label = 'Upload media files',
}: MediaUploaderProps): React.JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const acceptedTypes = resolveAcceptedTypes(mediaType);

  const { isDeleting, itemToDelete, handleDeleteRequest, handleCancelDelete, handleConfirmDelete } =
    useMediaUploaderActions({ mediaItems, onMediaChange, onDelete });

  const { handleFiles, handleInputChange } = useMediaUploaderFiles({
    mediaItems,
    onMediaChange,
    acceptedTypes,
    maxFiles,
    maxFileSize,
    disabled,
    inputRef,
  });

  const { isDragOver, handleDrop, handleDragOver, handleDragLeave } = useUploaderDrag(handleFiles);

  const { pendingCount, showUploadButton, isUploading, isDisabled, uploadDisabled } =
    getMediaUploaderFlags(mediaItems, Boolean(onUpload), disabled, isDeleting);

  return (
    <div className={cn('space-y-4', className)}>
      <UploaderStatusBanner message={mediaUploaderStatusMessage(isDeleting)} />

      <UploaderDropZone
        inputRef={inputRef}
        inputId={inputId}
        accept={acceptedTypes.join(',')}
        multiple={multiple}
        onChange={handleInputChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        label={label}
        isDragOver={isDragOver}
        isDisabled={isDisabled}
        disabled={disabled}
        currentCount={mediaItems.length}
        maxCount={maxFiles}
        countUnit="files"
        containerClassName="min-h-32 p-6"
        icon={<MediaUploadIcon mediaType={mediaType} />}
        acceptedTypesLabel={getAcceptedTypesDisplay(mediaType)}
        maxSizeMb={Math.round(maxFileSize / 1024 / 1024)}
        maxReachedLabel={<>Maximum {maxFiles} files reached</>}
      />

      <MediaUploaderList
        mediaItems={mediaItems}
        isDisabled={isDisabled}
        onDeleteRequest={handleDeleteRequest}
      />

      {showUploadButton && (
        <UploaderUploadButton
          onClick={() => triggerMediaUpload(mediaItems, onUpload)}
          disabled={uploadDisabled}
          isUploading={isUploading}
          pendingCount={pendingCount}
          noun="Files"
        />
      )}

      <MediaUploaderDeleteDialog
        itemToDelete={itemToDelete}
        onCancel={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
