/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { useAddPlaylistItemMutation } from '@/hooks/use-playlist-mutations';
import { DUPLICATE_ITEM_ERROR } from '@/lib/constants/playlists';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { buildAddPlaylistItemInput } from '@/lib/utils/build-add-playlist-item-input';

import { draftItemFromSearchItem, type DraftItem } from './use-playlist-creator';

/** The duplicate awaiting confirmation, tagged by which add path produced it. */
type PendingDuplicate =
  | { kind: 'draft'; title: string; draft: DraftItem }
  | { kind: 'server'; title: string; item: PlaylistSearchItem };

interface UseCreatorAddFlowArgs {
  /** Draft phase stages locally; any other phase adds through the server mutation. */
  isDraft: boolean;
  /** Target playlist for server adds; `null` only in the draft phase. */
  playlistId: string | null;
  /** Machine draft add — returns whether the source is already staged. */
  addItem: (item: DraftItem) => { duplicate: boolean };
  /** Machine forced draft add for a confirmed duplicate. */
  addItemForced: (item: DraftItem) => void;
}

/** Return surface of {@link useCreatorAddFlow}. */
export interface UseCreatorAddFlowResult {
  /** Handles a search-result selection for the current phase. */
  handleAdd: (item: PlaylistSearchItem) => void;
  /** Title for the duplicate-confirm dialog; null means the dialog is closed. */
  duplicateItemTitle: string | null;
  /** Re-runs the pending add (forced/staged) after the user confirms. */
  confirmDuplicate: () => void;
  /** Closes the duplicate dialog without adding. */
  dismissDuplicate: () => void;
}

/**
 * Phase-branched add flow for the playlist creator's search box. In the draft
 * phase items stage into the machine (a duplicate source opens the confirm
 * dialog, confirming force-stages the same draft item). In the saved/editing
 * phases items go through the add-item mutation: `DUPLICATE_ITEM` opens the
 * confirm dialog for a `force: true` retry, any other failure toasts the
 * action's error, and a thrown rejection toasts a generic message. One confirm
 * dialog (driven by `duplicateItemTitle`) serves both paths.
 */
export const useCreatorAddFlow = ({
  isDraft,
  playlistId,
  addItem,
  addItemForced,
}: UseCreatorAddFlowArgs): UseCreatorAddFlowResult => {
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null);
  const { addPlaylistItemAsync } = useAddPlaylistItemMutation();

  const runServerAdd = async (item: PlaylistSearchItem, force: boolean): Promise<void> => {
    if (!playlistId) return;
    try {
      const result = await addPlaylistItemAsync(buildAddPlaylistItemInput(item, playlistId, force));
      if (result.success) return;
      if (!force && result.error === DUPLICATE_ITEM_ERROR) {
        setPendingDuplicate({ kind: 'server', title: item.title, item });
        return;
      }
      toast.error(result.error);
    } catch {
      toast.error('Failed to add to playlist');
    }
  };

  const handleAdd = (item: PlaylistSearchItem): void => {
    if (!isDraft) {
      void runServerAdd(item, false);
      return;
    }
    const draft = draftItemFromSearchItem(item);
    const { duplicate } = addItem(draft);
    if (duplicate) setPendingDuplicate({ kind: 'draft', title: draft.title, draft });
  };

  const confirmDuplicate = (): void => {
    if (!pendingDuplicate) return;
    setPendingDuplicate(null);
    if (pendingDuplicate.kind === 'draft') {
      addItemForced(pendingDuplicate.draft);
      return;
    }
    void runServerAdd(pendingDuplicate.item, true);
  };

  const dismissDuplicate = (): void => setPendingDuplicate(null);

  return {
    handleAdd,
    duplicateItemTitle: pendingDuplicate?.title ?? null,
    confirmDuplicate,
    dismissDuplicate,
  };
};
