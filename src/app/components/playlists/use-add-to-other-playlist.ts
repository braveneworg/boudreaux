/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { useAddPlaylistItemMutation } from '@/hooks/use-playlist-mutations';
import { DUPLICATE_ITEM_ERROR } from '@/lib/constants/playlists';
import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { buildAddPlaylistItemInput } from '@/lib/utils/build-add-playlist-item-input';

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

/**
 * State + mutation flow for the search rows' "Add to another playlist" action:
 * one inline picker open at a time (keyed by `item.key`), the duplicate-confirm
 * dialog, and the add mutation with its toast outcomes. Success (including a
 * forced add) toasts `Added to {title}`, closes the dialog, and closes the
 * picker ONLY IF it still shows the row this add started from — so a stale
 * add for one row can't slam shut a picker the user reopened on another row;
 * `DUPLICATE_ITEM` opens the confirm dialog for a forced retry; any other
 * failure toasts the action's error and leaves the picker open. Picks are
 * ignored while an add is already in flight (`isAddingPlaylistItem`) so a
 * double click can't double-fire the mutation.
 */
export const useAddToOtherPlaylist = (): UseAddToOtherPlaylistResult => {
  const [activeItem, setActiveItem] = useState<PlaylistSearchItem | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<AddTarget | null>(null);
  const { addPlaylistItemAsync, isAddingPlaylistItem } = useAddPlaylistItemMutation();

  const runAdd = async ({ item, playlist }: AddTarget, force: boolean): Promise<void> => {
    try {
      const result = await addPlaylistItemAsync(
        buildAddPlaylistItemInput(item, playlist.id, force)
      );
      if (result.success) {
        toast.success(`Added to ${playlist.title}`);
        // Close only the picker this add was started from — leave any picker
        // the user reopened on a different row in the meantime untouched.
        setActiveItem((current) => (current?.key === item.key ? null : current));
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
    if (!activeItem || isAddingPlaylistItem) return;
    void runAdd({ item: activeItem, playlist }, false);
  };

  const confirmDuplicate = (): void => {
    if (!duplicateTarget || isAddingPlaylistItem) return;
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
