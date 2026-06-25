/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import type { MediaItem } from './media-uploader-types';

interface UseMediaUploaderActionsParams {
  mediaItems: MediaItem[];
  onMediaChange: (items: MediaItem[]) => void;
  onDelete?: (itemId: string) => Promise<{ success: boolean; error?: string }>;
}

interface UseMediaUploaderActions {
  isDeleting: boolean;
  itemToDelete: MediaItem | null;
  handleDeleteRequest: (item: MediaItem) => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => Promise<void>;
}

/**
 * Manages the media uploader's delete confirmation state machine, including the
 * optional server-side delete via `onDelete` and removal from local state.
 */
export const useMediaUploaderActions = ({
  mediaItems,
  onMediaChange,
  onDelete,
}: UseMediaUploaderActionsParams): UseMediaUploaderActions => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);

  const handleDeleteRequest = useCallback((item: MediaItem) => setItemToDelete(item), []);
  const handleCancelDelete = useCallback(() => setItemToDelete(null), []);

  const handleConfirmDelete = useCallback(async () => {
    if (!itemToDelete) return;

    if (itemToDelete.uploadedUrl && onDelete) {
      setIsDeleting(true);
      try {
        const result = await onDelete(itemToDelete.id);
        if (!result.success) {
          console.error('Failed to delete media from server:', result.error);
        }
      } catch (error) {
        console.error('Error deleting media from server:', error);
      } finally {
        setIsDeleting(false);
      }
    }

    onMediaChange(mediaItems.filter((item) => item.id !== itemToDelete.id));
    setItemToDelete(null);
  }, [itemToDelete, mediaItems, onMediaChange, onDelete]);

  return {
    isDeleting,
    itemToDelete,
    handleDeleteRequest,
    handleCancelDelete,
    handleConfirmDelete,
  };
};
