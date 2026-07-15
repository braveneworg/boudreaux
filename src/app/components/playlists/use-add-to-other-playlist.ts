/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { useAddPlaylistItemMutation } from '@/hooks/use-playlist-mutations';
import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';
import type { AddPlaylistItemInput } from '@/lib/validation/playlist-schema';

/** Exact error signal `addPlaylistItemAction` returns for an already-present source. */
const DUPLICATE_ITEM_ERROR = 'DUPLICATE_ITEM';

/** The row item + picked playlist an in-flight or duplicate-confirmed add targets. */
interface AddTarget {
  item: PlaylistSearchItem;
  playlist: PlaylistListRow;
}

/** Return surface of {@link useAddToOtherPlaylist}. */
export interface UseAddToOtherPlaylistResult {
  /** `item.key` of the row whose inline picker is open, or null when closed. */
  openPickerKey: string | null;
  /** Toggles the picker for a row; opening one row closes any other row's picker. */
  togglePicker: (item: PlaylistSearchItem) => void;
  /** Adds the active row's item to the picked playlist (non-forced). */
  pickPlaylist: (playlist: PlaylistListRow) => void;
  /** Title for the duplicate-confirm dialog; null means the dialog is closed. */
  duplicateItemTitle: string | null;
  /** Re-runs the add with `force: true` after the user confirms the duplicate. */
  confirmDuplicate: () => void;
  /** Closes the duplicate dialog without adding. */
  dismissDuplicate: () => void;
}

/** Builds the exact add-item action input from a search item's source ref. */
const addItemInputFor = (
  { source }: PlaylistSearchItem,
  playlistId: string,
  force: boolean
): AddPlaylistItemInput =>
  'trackFileId' in source
    ? { itemType: 'track', trackFileId: source.trackFileId, playlistId, force }
    : { itemType: 'video', videoId: source.videoId, playlistId, force };

/**
 * State + mutation flow for the search rows' "Add to another playlist" action:
 * one inline picker open at a time (keyed by `item.key`), the duplicate-confirm
 * dialog, and the add mutation with its toast outcomes. Success (including a
 * forced add) toasts `Added to {title}` and closes picker + dialog;
 * `DUPLICATE_ITEM` opens the confirm dialog for a forced retry; any other
 * failure toasts the action's error and leaves the picker open.
 */
export const useAddToOtherPlaylist = (): UseAddToOtherPlaylistResult => {
  const [activeItem, setActiveItem] = useState<PlaylistSearchItem | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<AddTarget | null>(null);
  const { addPlaylistItemAsync } = useAddPlaylistItemMutation();

  const runAdd = async ({ item, playlist }: AddTarget, force: boolean): Promise<void> => {
    try {
      const result = await addPlaylistItemAsync(addItemInputFor(item, playlist.id, force));
      if (result.success) {
        toast.success(`Added to ${playlist.title}`);
        setActiveItem(null);
        setDuplicateTarget(null);
        return;
      }
      if (!force && result.error === DUPLICATE_ITEM_ERROR) {
        setDuplicateTarget({ item, playlist });
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error('Failed to add to playlist');
    }
  };

  const togglePicker = (item: PlaylistSearchItem): void =>
    setActiveItem((current) => (current?.key === item.key ? null : item));

  const pickPlaylist = (playlist: PlaylistListRow): void => {
    if (!activeItem) return;
    void runAdd({ item: activeItem, playlist }, false);
  };

  const confirmDuplicate = (): void => {
    if (!duplicateTarget) return;
    setDuplicateTarget(null);
    void runAdd(duplicateTarget, true);
  };

  const dismissDuplicate = (): void => setDuplicateTarget(null);

  return {
    openPickerKey: activeItem?.key ?? null,
    togglePicker,
    pickPlaylist,
    duplicateItemTitle: duplicateTarget?.item.title ?? null,
    confirmDuplicate,
    dismissDuplicate,
  };
};
