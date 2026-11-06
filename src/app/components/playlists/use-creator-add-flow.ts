/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState } from 'react';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useAddToPlaylist } from './use-add-to-playlist';
import { draftItemFromSearchItem, type DraftItem } from './use-playlist-creator';

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
 * phase items stage into the machine: a source already staged opens the
 * confirm dialog, and confirming force-stages the same draft item. In the
 * saved/editing phases items go to the saved playlist through
 * {@link useAddToPlaylist}, which owns the server duplicate question, the
 * forced retry and the failure toasts; a success lands silently in the
 * creator's list. One confirm dialog (driven by `duplicateItemTitle`) serves
 * both paths.
 */
export const useCreatorAddFlow = ({
  isDraft,
  playlistId,
  addItem,
  addItemForced,
}: UseCreatorAddFlowArgs): UseCreatorAddFlowResult => {
  const [pendingDraft, setPendingDraft] = useState<DraftItem | null>(null);
  const serverAdd = useAddToPlaylist();

  const handleAdd = (item: PlaylistSearchItem): void => {
    if (!isDraft) {
      if (playlistId) serverAdd.add({ item, playlistId });
      return;
    }
    const draft = draftItemFromSearchItem(item);
    const { duplicate } = addItem(draft);
    if (duplicate) setPendingDraft(draft);
  };

  const confirmDuplicate = (): void => {
    if (!pendingDraft) {
      serverAdd.confirmDuplicate();
      return;
    }
    setPendingDraft(null);
    addItemForced(pendingDraft);
  };

  const dismissDuplicate = (): void => {
    setPendingDraft(null);
    serverAdd.dismissDuplicate();
  };

  return {
    handleAdd,
    duplicateItemTitle: pendingDraft?.title ?? serverAdd.duplicateItemTitle,
    confirmDuplicate,
    dismissDuplicate,
  };
};
