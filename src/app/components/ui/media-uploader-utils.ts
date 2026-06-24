/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ALL_MEDIA_FILE_TYPES,
  AUDIO_FILE_TYPES,
  VIDEO_FILE_TYPES,
  type MediaItem,
  type MediaType,
} from './media-uploader-types';

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes.at(i)}`;
};

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Resolve the accepted MIME types for the given media type.
 */
export const resolveAcceptedTypes = (mediaType: MediaType): string[] => {
  switch (mediaType) {
    case 'audio':
      return [...AUDIO_FILE_TYPES];
    case 'video':
      return [...VIDEO_FILE_TYPES];
    default:
      return [...ALL_MEDIA_FILE_TYPES];
  }
};

/**
 * Human-readable list of accepted formats shown in the drop zone hint.
 */
export const getAcceptedTypesDisplay = (mediaType: MediaType): string => {
  switch (mediaType) {
    case 'audio':
      return 'MP3, WAV, FLAC, AAC, OGG, M4A';
    case 'video':
      return 'MP4, WebM, MOV, AVI, MKV';
    default:
      return 'Audio & Video files';
  }
};

/**
 * The status banner message for the current persistence state, or `null` when
 * idle.
 */
export const mediaUploaderStatusMessage = (isDeleting: boolean): string | null =>
  isDeleting ? 'Deleting...' : null;

/**
 * Media items that still need uploading (no uploaded URL and no error).
 */
export const getPendingMedia = (items: MediaItem[]): MediaItem[] =>
  items.filter((item) => !item.uploadedUrl && !item.error);

/**
 * Whether any pending item carries a real `File` (locally selected, not yet
 * uploaded), which gates the upload button.
 */
export const hasUnuploadedMedia = (items: MediaItem[]): boolean =>
  items.some((item) => !item.uploadedUrl && !item.error && item.file);

/**
 * Whether any media item is currently uploading.
 */
export const hasUploadingMedia = (items: MediaItem[]): boolean =>
  items.some((item) => item.isUploading);

/**
 * Derived UI flags for the media uploader, computed from its items and state.
 */
export interface MediaUploaderFlags {
  pendingCount: number;
  showUploadButton: boolean;
  isUploading: boolean;
  isDisabled: boolean;
  uploadDisabled: boolean;
}

/**
 * Computes the derived flags that drive the media uploader's UI (pending count,
 * upload-button visibility, uploading/disabled states).
 */
export const getMediaUploaderFlags = (
  items: MediaItem[],
  hasUpload: boolean,
  disabled: boolean,
  isDeleting: boolean
): MediaUploaderFlags => {
  const isUploading = hasUploadingMedia(items);
  const isDisabled = disabled || isDeleting;

  return {
    pendingCount: getPendingMedia(items).length,
    showUploadButton: hasUpload && hasUnuploadedMedia(items),
    isUploading,
    isDisabled,
    uploadDisabled: isDisabled || isUploading,
  };
};

/**
 * Invokes `onUpload` with the pending items, if there are any and a handler is
 * provided.
 */
export const triggerMediaUpload = (
  items: MediaItem[],
  onUpload?: (items: MediaItem[]) => Promise<void>
): void => {
  if (!onUpload || items.length === 0) return;
  const itemsToUpload = getPendingMedia(items);
  if (itemsToUpload.length > 0) {
    onUpload(itemsToUpload);
  }
};
