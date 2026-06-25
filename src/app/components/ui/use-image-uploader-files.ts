/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import type { ImageItem } from './image-uploader-types';

interface UseImageUploaderFilesParams {
  images: ImageItem[];
  onImagesChange: (images: ImageItem[]) => void;
  maxImages: number;
  maxFileSize: number;
  acceptedTypes: string[];
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

interface UseImageUploaderFiles {
  handleFiles: (files: FileList | null) => void;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Validates a candidate file against the accepted types and max size.
 * Returns an error string, or `null` when the file is acceptable.
 */
const validateFile = (file: File, acceptedTypes: string[], maxFileSize: number): string | null => {
  if (!acceptedTypes.includes(file.type)) {
    return `Invalid file type. Accepted: ${acceptedTypes.join(', ')}`;
  }
  if (file.size > maxFileSize) {
    return `File too large. Max size: ${Math.round(maxFileSize / 1024 / 1024)}MB`;
  }
  return null;
};

/**
 * Builds an {@link ImageItem} from a file, attaching a blob preview URL and any
 * validation error.
 */
const createImageItem = (file: File, acceptedTypes: string[], maxFileSize: number): ImageItem => {
  const error = validateFile(file, acceptedTypes, maxFileSize);
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    preview: URL.createObjectURL(file),
    error: error || undefined,
  };
};

/**
 * Encapsulates file selection for the image uploader: turning selected/dropped
 * files into {@link ImageItem}s (capped at the remaining slots) and resetting
 * the input so the same file can be re-selected.
 *
 * @returns `handleFiles` for drop/programmatic use and `handleInputChange` for
 * the file input's `onChange`.
 */
export const useImageUploaderFiles = ({
  images,
  onImagesChange,
  maxImages,
  maxFileSize,
  acceptedTypes,
  disabled,
  inputRef,
}: UseImageUploaderFilesParams): UseImageUploaderFiles => {
  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || disabled) return;

      const remainingSlots = maxImages - images.length;
      if (remainingSlots <= 0) return;

      const newFiles = Array.from(files).slice(0, remainingSlots);
      const newImages = newFiles.map((file) => createImageItem(file, acceptedTypes, maxFileSize));

      onImagesChange([...images, ...newImages]);
    },
    [images, maxImages, disabled, acceptedTypes, maxFileSize, onImagesChange]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
      // Reset input value to allow selecting the same file again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles, inputRef]
  );

  return { handleFiles, handleInputChange };
};
