/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useRef, useState } from 'react';

import { toast } from 'sonner';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { buildAddPlaylistItemInput } from '@/lib/utils/build-add-playlist-item-input';

import { PlaylistActionError } from './_hooks/mutations/playlist-action-error';
import { useAddPlaylistItemMutation } from './_hooks/mutations/use-playlist-mutations';

/** Copy for an add that failed without an answer from the action (network, crash). */
const ADD_FAILED_MESSAGE = 'Failed to add to playlist';

/** One add: which item goes into which playlist. */
export interface AddToPlaylistTarget {
  item: PlaylistSearchItem;
  playlistId: string;
  /**
   * The playlist's title, when the caller names it: a success then toasts
   * `Added to {title}`. Leave it out where the listener watches the item land
   * (the creator's own list), and the add succeeds silently.
   */
  playlistTitle?: string;
}

/** Arguments for {@link useAddToPlaylist}. */
export interface UseAddToPlaylistArgs {
  /** Called after each successful add, forced or not, with its target. */
  onAdded?: (target: AddToPlaylistTarget) => void;
}

/** Return surface of {@link useAddToPlaylist}. */
export interface UseAddToPlaylistResult {
  /** Adds the target's item to its playlist (not forced). */
  add: (target: AddToPlaylistTarget) => void;
  /** Title for the duplicate-confirm dialog; null means the dialog is closed. */
  duplicateItemTitle: string | null;
  /** Adds the pending duplicate again with `force: true`. */
  confirmDuplicate: () => void;
  /** Closes the duplicate dialog without adding. */
  dismissDuplicate: () => void;
}

/** Key of an add in flight: one item into one playlist. */
const addKeyFor = ({ item, playlistId }: AddToPlaylistTarget): string =>
  `${playlistId}:${item.key}`;

/** True when the add was refused because the item is already in the playlist. */
const isDuplicateItem = (error: unknown): boolean =>
  error instanceof PlaylistActionError && error.code === 'DUPLICATE_ITEM';

/**
 * The one add-to-playlist module: every surface that adds a song or video to a
 * saved playlist goes through it. It owns the add, the duplicate question (a
 * `DUPLICATE_ITEM` answer opens the confirm dialog; confirming adds again with
 * `force: true`), and the toasts: `Added to {title}` on success when the target
 * names its playlist, the action's copy on any other failure, and a generic
 * message when the action never answered. It branches only on the failure's
 * code, never on its copy. A second add of the same item to the same playlist
 * is ignored while the first is in flight, so a double click cannot add twice;
 * adds of different items run side by side.
 */
export const useAddToPlaylist = ({
  onAdded,
}: UseAddToPlaylistArgs = {}): UseAddToPlaylistResult => {
  const [duplicateTarget, setDuplicateTarget] = useState<AddToPlaylistTarget | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const { addPlaylistItemAsync } = useAddPlaylistItemMutation();

  const runAdd = async (target: AddToPlaylistTarget, force: boolean): Promise<void> => {
    const key = addKeyFor(target);
    if (inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    try {
      await addPlaylistItemAsync(buildAddPlaylistItemInput(target.item, target.playlistId, force));
      if (target.playlistTitle) toast.success(`Added to ${target.playlistTitle}`);
      onAdded?.(target);
    } catch (error) {
      if (!force && isDuplicateItem(error)) {
        setDuplicateTarget(target);
        return;
      }
      toast.error(error instanceof PlaylistActionError ? error.message : ADD_FAILED_MESSAGE);
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  const add = (target: AddToPlaylistTarget): void => {
    void runAdd(target, false);
  };

  const confirmDuplicate = (): void => {
    if (!duplicateTarget) return;
    setDuplicateTarget(null);
    void runAdd(duplicateTarget, true);
  };

  const dismissDuplicate = (): void => setDuplicateTarget(null);

  return {
    add,
    duplicateItemTitle: duplicateTarget?.item.title ?? null,
    confirmDuplicate,
    dismissDuplicate,
  };
};
