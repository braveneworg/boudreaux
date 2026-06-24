/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import type { MediaItem } from './media-uploader-types';

interface UseMediaUploaderFilesParams {
  mediaItems: MediaItem[];
  onMediaChange: (items: MediaItem[]) => void;
  acceptedTypes: string[];
  maxFiles: number;
  maxFileSize: number;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

interface UseMediaUploaderFiles {
  handleFiles: (files: FileList | null) => Promise<void>;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Validates a candidate file against the accepted types and max size.
 * Returns an error string, or `null` when the file is acceptable.
 */
const validateFile = (file: File, acceptedTypes: string[], maxFileSize: number): string | null => {
  if (!acceptedTypes.includes(file.type)) {
    return `Invalid file type. Accepted: audio and video files`;
  }
  if (file.size > maxFileSize) {
    return `File too large. Max size: ${Math.round(maxFileSize / 1024 / 1024)}MB`;
  }
  return null;
};

/**
 * Reads a media file's duration via a detached media element, resolving
 * `undefined` if the metadata cannot be read.
 */
const getMediaDuration = (file: File): Promise<number | undefined> =>
  new Promise((resolve) => {
    const mediaElement = file.type.startsWith('video/')
      ? document.createElement('video')
      : document.createElement('audio');

    mediaElement.preload = 'metadata';

    mediaElement.onloadedmetadata = () => {
      URL.revokeObjectURL(mediaElement.src);
      resolve(Math.round(mediaElement.duration));
    };

    mediaElement.onerror = () => {
      URL.revokeObjectURL(mediaElement.src);
      resolve(undefined);
    };

    mediaElement.src = URL.createObjectURL(file);
  });

/**
 * Builds a {@link MediaItem} from a file, attaching any validation error and the
 * decoded duration (skipped when the file is invalid).
 */
const createMediaItem = async (
  file: File,
  acceptedTypes: string[],
  maxFileSize: number
): Promise<MediaItem> => {
  const error = validateFile(file, acceptedTypes, maxFileSize);
  const duration = error ? undefined : await getMediaDuration(file);

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    file,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    mediaType: file.type.startsWith('video/') ? 'video' : 'audio',
    duration,
    error: error || undefined,
  };
};

/**
 * Encapsulates file selection for the media uploader: turning selected/dropped
 * files into {@link MediaItem}s (capped at the remaining slots, durations
 * decoded in parallel) and resetting the input so the same file can be
 * re-selected.
 */
export const useMediaUploaderFiles = ({
  mediaItems,
  onMediaChange,
  acceptedTypes,
  maxFiles,
  maxFileSize,
  disabled,
  inputRef,
}: UseMediaUploaderFilesParams): UseMediaUploaderFiles => {
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return;

      const remainingSlots = maxFiles - mediaItems.length;
      if (remainingSlots <= 0) return;

      const newFiles = Array.from(files).slice(0, remainingSlots);
      const newItems = await Promise.all(
        newFiles.map((file) => createMediaItem(file, acceptedTypes, maxFileSize))
      );

      onMediaChange([...mediaItems, ...newItems]);
    },
    [mediaItems, maxFiles, disabled, acceptedTypes, maxFileSize, onMediaChange]
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
