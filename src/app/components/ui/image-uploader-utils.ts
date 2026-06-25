/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ImageItem } from './image-uploader-types';

/**
 * Cleans up malformed URLs that may have duplicate protocols (e.g., https://https://)
 */
export const cleanImageUrl = (url: string): string => {
  if (!url) return url;
  // Fix double https:// protocol
  return url.replace(/^https?:\/\/https?:\/\//, 'https://');
};

/**
 * Images that still need uploading (no uploaded URL and no validation error).
 */
export const getPendingImages = (images: ImageItem[]): ImageItem[] =>
  images.filter((img) => !img.uploadedUrl && !img.error);

/**
 * Whether any pending image carries a real `File` (i.e. is locally selected and
 * not yet uploaded), which gates the upload button.
 */
export const hasUnuploadedImages = (images: ImageItem[]): boolean =>
  images.some((img) => !img.uploadedUrl && !img.error && img.file);

/**
 * Whether any image is currently uploading.
 */
export const hasUploadingImage = (images: ImageItem[]): boolean =>
  images.some((img) => img.isUploading);

/**
 * The status banner message for the current persistence state, or `null` when
 * idle. Deleting takes precedence over reordering.
 */
export const imageUploaderStatusMessage = (
  isReordering: boolean,
  isDeleting: boolean
): string | null => {
  if (isDeleting) return 'Deleting...';
  if (isReordering) return 'Saving order...';
  return null;
};

/**
 * Invokes `onUpload` with the pending images, if there are any and a handler is
 * provided.
 */
export const triggerImageUpload = (
  images: ImageItem[],
  onUpload?: (images: ImageItem[]) => Promise<void>
): void => {
  if (!onUpload || images.length === 0) return;
  const imagesToUpload = getPendingImages(images);
  if (imagesToUpload.length > 0) {
    onUpload(imagesToUpload);
  }
};
