/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useMemo, useRef, useState } from 'react';

import { toast } from 'sonner';

import type { PlaylistDetailResponse, PlaylistItemPayload } from '@/lib/types/domain/playlist';

import {
  useRemovePlaylistItemMutation,
  useReorderPlaylistItemsMutation,
} from './_hooks/mutations/use-playlist-mutations';

import type { PlaylistCreatorItemData } from './playlist-creator-item';

interface UseCreatorServerItemsArgs {
  /** The saved playlist the items belong to; `null` during the draft phase. */
  playlistId: string | null;
  /** The playlist detail the server-owned items come from. */
  detail: PlaylistDetailResponse | undefined;
}

/** Return surface of {@link useCreatorServerItems}. */
export interface UseCreatorServerItemsResult {
  /** Detail items ordered by `sortOrder`, with any optimistic reorder applied. */
  items: PlaylistCreatorItemData[];
  /** Applies the order locally, then persists it (reverting + toasting on error). */
  reorderItems: (orderedIds: string[]) => void;
  /** Removes the item via mutation; failures toast, success drops it locally. */
  removeItem: (id: string) => void;
}

const toListItem = ({
  id,
  title,
  artistName,
  duration,
  coverArt,
  itemType,
}: PlaylistItemPayload): PlaylistCreatorItemData => ({
  id,
  title,
  artistName,
  duration,
  coverArt,
  isVideo: itemType === 'video',
});

/**
 * Server-owned item list for the saved/editing phases: maps `detail.items`
 * (sorted by `sortOrder`) into creator rows and wires reorder/remove to their
 * mutations with the artist-pill-list optimistic pattern — reorder applies
 * locally first and reverts (with an error toast) when the mutation fails;
 * a new detail from the query resyncs the local order.
 */
export const useCreatorServerItems = ({
  playlistId,
  detail,
}: UseCreatorServerItemsArgs): UseCreatorServerItemsResult => {
  const mapped = useMemo(
    () =>
      [...(detail?.items ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((item) => toListItem(item)),
    [detail]
  );
  const [items, setItems] = useState<PlaylistCreatorItemData[]>(mapped);
  const prevMappedRef = useRef(mapped);
  const { reorderPlaylistItems } = useReorderPlaylistItemsMutation();
  const { removePlaylistItem } = useRemovePlaylistItemMutation();

  // Resync local (possibly optimistic) order whenever the detail changes —
  // compare against the previous mapped reference, not local state, so an
  // optimistic update survives until the query actually delivers new data.
  if (mapped !== prevMappedRef.current) {
    prevMappedRef.current = mapped;
    setItems(mapped);
  }

  const reorderItems = (orderedIds: string[]): void => {
    if (!playlistId) return;
    const previous = items;
    const byId = new Map(items.map((item): [string, PlaylistCreatorItemData] => [item.id, item]));
    const next = orderedIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    if (next.length !== items.length) return;
    setItems(next);
    reorderPlaylistItems(
      { playlistId, orderedItemIds: orderedIds },
      {
        onError: (error) => {
          setItems(previous);
          toast.error(error.message);
        },
      }
    );
  };

  const removeItem = (itemId: string): void => {
    if (!playlistId) return;
    removePlaylistItem(
      { playlistId, itemId },
      {
        onSuccess: () => setItems((prev) => prev.filter(({ id }) => id !== itemId)),
        onError: (error) => toast.error(error.message),
      }
    );
  };

  return { items, reorderItems, removeItem };
};
