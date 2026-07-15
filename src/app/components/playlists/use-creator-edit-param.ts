/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useEffect, useRef } from 'react';

import { toast } from 'sonner';

import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

interface UseCreatorEditParamArgs {
  /** External "open this playlist for editing" request, or null when idle. */
  editPlaylistId: string | null;
  /** Detail-query pending flag — a settled query with no data means it failed. */
  isPending: boolean;
  /** The fetched detail (must match `editPlaylistId` before editing starts). */
  detail: PlaylistDetailResponse | undefined;
  /** Machine transition into the editing phase. */
  loadForEdit: (playlistId: string) => void;
  /** Ack so the owner clears the edit request (fired on success and on error). */
  onEditHandled: () => void;
}

/**
 * Reacts to an external edit request: once the detail for `editPlaylistId` is
 * cached it moves the machine into the editing phase and acks via
 * `onEditHandled`; a failed detail query toasts and acks without touching the
 * machine. A ref guards the effect to fire once per requested id (the id
 * resets when the request clears, so re-requesting the same playlist works).
 */
export const useCreatorEditParam = ({
  editPlaylistId,
  isPending,
  detail,
  loadForEdit,
  onEditHandled,
}: UseCreatorEditParamArgs): void => {
  const handledEditIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (editPlaylistId === null) {
      handledEditIdRef.current = null;
      return;
    }
    if (handledEditIdRef.current === editPlaylistId) return;
    if (detail?.id === editPlaylistId) {
      handledEditIdRef.current = editPlaylistId;
      loadForEdit(editPlaylistId);
      onEditHandled();
      return;
    }
    if (!isPending && detail === undefined) {
      handledEditIdRef.current = editPlaylistId;
      toast.error('Failed to load playlist');
      onEditHandled();
    }
  }, [editPlaylistId, isPending, detail, loadForEdit, onEditHandled]);
};
