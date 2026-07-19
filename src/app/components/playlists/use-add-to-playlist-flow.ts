/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { useAddPlaylistItemMutation } from '@/hooks/mutations/use-playlist-mutations';
import { DUPLICATE_ITEM_ERROR } from '@/lib/constants/playlists';
import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { buildAddPlaylistItemInput } from '@/lib/utils/build-add-playlist-item-input';

/** Arguments for {@link useAddToPlaylistFlow}. */
export interface UseAddToPlaylistFlowArgs {
  /** The single fixed item every add targets. */
  item: PlaylistSearchItem;
  /** Called after a successful add — e.g. to close the popover. */
  onAdded?: () => void;
}

/** Return surface of {@link useAddToPlaylistFlow}. */
export interface UseAddToPlaylistFlowResult {
  /** Adds the fixed item to the picked playlist (non-forced). */
  pickPlaylist: (playlist: PlaylistListRow) => void;
  /** Title for the duplicate-confirm dialog; null means the dialog is closed. */
  duplicateItemTitle: string | null;
  /** Re-runs the add with `force: true` after the user confirms the duplicate. */
  confirmDuplicate: () => void;
  /** Closes the duplicate dialog without adding. */
  dismissDuplicate: () => void;
  /** True while an add mutation is in flight. */
  isAdding: boolean;
}

/**
 * State + mutation flow for the add-to-playlist panel: one fixed `item` is added
 * to whichever playlist the user picks, with the duplicate-confirm dialog and the
 * add mutation's toast outcomes. Success (including a forced add) toasts
 * `Added to {title}`, closes the dialog, and calls `onAdded`; `DUPLICATE_ITEM`
 * opens the confirm dialog for a forced retry; any other failure toasts the
 * action's error. Picks are ignored while an add is already in flight
 * (`isAddingPlaylistItem`) so a double click can't double-fire the mutation.
 */
export const useAddToPlaylistFlow = ({
  item,
  onAdded,
}: UseAddToPlaylistFlowArgs): UseAddToPlaylistFlowResult => {
  const [duplicateTarget, setDuplicateTarget] = useState<PlaylistListRow | null>(null);
  const { addPlaylistItemAsync, isAddingPlaylistItem } = useAddPlaylistItemMutation();

  const runAdd = async (playlist: PlaylistListRow, force: boolean): Promise<void> => {
    try {
      const result = await addPlaylistItemAsync(
        buildAddPlaylistItemInput(item, playlist.id, force)
      );
      if (result.success) {
        toast.success(`Added to ${playlist.title}`);
        setDuplicateTarget(null);
        onAdded?.();
        return;
      }
      if (!force && result.error === DUPLICATE_ITEM_ERROR) {
        setDuplicateTarget(playlist);
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error('Failed to add to playlist');
    }
  };

  const pickPlaylist = (playlist: PlaylistListRow): void => {
    if (isAddingPlaylistItem) return;
    void runAdd(playlist, false);
  };

  const confirmDuplicate = (): void => {
    if (!duplicateTarget || isAddingPlaylistItem) return;
    const target = duplicateTarget;
    setDuplicateTarget(null);
    void runAdd(target, true);
  };

  const dismissDuplicate = (): void => setDuplicateTarget(null);

  return {
    pickPlaylist,
    duplicateItemTitle: duplicateTarget ? item.title : null,
    confirmDuplicate,
    dismissDuplicate,
    isAdding: isAddingPlaylistItem,
  };
};
