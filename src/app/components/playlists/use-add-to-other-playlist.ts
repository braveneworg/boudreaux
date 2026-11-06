/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useAddToPlaylist } from './use-add-to-playlist';

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
 * The search rows' "Add to another playlist" action: one inline picker open at
 * a time (keyed by `item.key`), with the add itself — duplicate confirm,
 * forced retry and toasts — left to {@link useAddToPlaylist}. A successful add
 * closes the picker ONLY IF it still shows the row the add started from, so a
 * stale add for one row can't slam shut a picker the user reopened on another
 * row; a failed add leaves the picker open.
 */
export const useAddToOtherPlaylist = (): UseAddToOtherPlaylistResult => {
  const [activeItem, setActiveItem] = useState<PlaylistSearchItem | null>(null);
  const { add, duplicateItemTitle, confirmDuplicate, dismissDuplicate } = useAddToPlaylist({
    onAdded: ({ item }) => setActiveItem((current) => (current?.key === item.key ? null : current)),
  });

  const togglePicker = (item: PlaylistSearchItem): void =>
    setActiveItem((current) => (current?.key === item.key ? null : item));

  const pickPlaylist = ({ id, title }: PlaylistListRow): void => {
    if (!activeItem) return;
    add({ item: activeItem, playlistId: id, playlistTitle: title });
  };

  return {
    openPickerKey: activeItem?.key ?? null,
    togglePicker,
    pickPlaylist,
    duplicateItemTitle,
    confirmDuplicate,
    dismissDuplicate,
  };
};
