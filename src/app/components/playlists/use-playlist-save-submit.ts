/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createPlaylistAction, updatePlaylistAction } from '@/lib/actions/playlist-actions';
import { queryKeys } from '@/lib/query-keys';
import type { PlaylistDetailResponse, PlaylistItemSourceRef } from '@/lib/types/domain/playlist';

import { usePlaylistCoverUpload } from './use-playlist-cover-upload';

const SAVED_TOAST_MESSAGE = 'Playlist saved';
const COVER_UPLOAD_PARTIAL_MESSAGE = 'Some cover images failed to upload.';
const GENERIC_SAVE_ERROR = 'Failed to save playlist';

/**
 * Form values managed by the save dialog. Mirrors the dialog's composed Zod
 * schema (`playlistTitleSchema` + boolean + `coverImagesSchema`); the two are
 * kept aligned at compile time by the dialog's `useForm<PlaylistSaveFormValues>`
 * + `zodResolver` pairing.
 */
export interface PlaylistSaveFormValues {
  title: string;
  isPublic: boolean;
  coverImages: string[];
}

/** The failure arm of a playlist action result. */
interface PlaylistActionFailure {
  error: string;
  fieldErrors?: Record<string, string[]>;
}

/** Everything the module-scope flow helpers need from the hook's render scope. */
interface SaveFlowDeps {
  queryClient: QueryClient;
  uploadFiles: (playlistId: string, files: File[]) => Promise<string[]>;
  onTitleError: (message: string) => void;
  onSaved: (playlist: PlaylistDetailResponse) => void;
  onOpenChange: (open: boolean) => void;
}

const finishSave = (
  { onOpenChange, onSaved }: SaveFlowDeps,
  playlist: PlaylistDetailResponse
): void => {
  toast.success(SAVED_TOAST_MESSAGE);
  onOpenChange(false);
  onSaved(playlist);
};

const applyFailure = (
  { onTitleError }: SaveFlowDeps,
  { error, fieldErrors }: PlaylistActionFailure
): void => {
  const titleError = fieldErrors?.title?.at(0);
  if (titleError) {
    onTitleError(titleError);
    return;
  }
  toast.error(error);
};

/** Reproduces `useCreatePlaylistMutation` cache semantics. */
const seedCreatedPlaylist = (
  queryClient: QueryClient,
  detail: PlaylistDetailResponse
): Promise<unknown> => {
  queryClient.setQueryData(queryKeys.playlists.detail(detail.id), detail);
  return queryClient.invalidateQueries({ queryKey: queryKeys.playlists.mine() });
};

/** Reproduces `useUpdatePlaylistMutation` cache semantics. */
const invalidateUpdatedPlaylist = (queryClient: QueryClient, id: string): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.mine() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(id) }),
  ]);

/**
 * Upload the staged files against the created playlist, then attach the
 * uploaded URLs (after the artist-image selections) via an update. Returns
 * the freshest playlist available; upload/update failures degrade to the
 * created playlist after an error toast.
 */
const attachPendingCovers = async (
  deps: SaveFlowDeps,
  created: PlaylistDetailResponse,
  artistSelections: string[],
  pendingFiles: File[]
): Promise<PlaylistDetailResponse> => {
  const uploaded = await deps.uploadFiles(created.id, pendingFiles);
  if (uploaded.length < pendingFiles.length) toast.error(COVER_UPLOAD_PARTIAL_MESSAGE);
  if (uploaded.length === 0) return created;
  const result = await updatePlaylistAction({
    playlistId: created.id,
    coverImages: [...artistSelections, ...uploaded],
  });
  if (!result.success) {
    toast.error(result.error);
    return created;
  }
  await invalidateUpdatedPlaylist(deps.queryClient, created.id);
  return result.data;
};

const runCreateFlow = async (
  deps: SaveFlowDeps,
  pendingItemRefs: PlaylistItemSourceRef[],
  values: PlaylistSaveFormValues,
  pendingFiles: File[]
): Promise<void> => {
  const result = await createPlaylistAction({ ...values, items: pendingItemRefs });
  if (!result.success) {
    applyFailure(deps, result);
    return;
  }
  await seedCreatedPlaylist(deps.queryClient, result.data);
  const finalPlaylist =
    pendingFiles.length > 0
      ? await attachPendingCovers(deps, result.data, values.coverImages, pendingFiles)
      : result.data;
  finishSave(deps, finalPlaylist);
};

const runEditFlow = async (
  deps: SaveFlowDeps,
  id: string,
  values: PlaylistSaveFormValues
): Promise<void> => {
  const result = await updatePlaylistAction({ playlistId: id, ...values });
  if (!result.success) {
    applyFailure(deps, result);
    return;
  }
  await invalidateUpdatedPlaylist(deps.queryClient, id);
  finishSave(deps, result.data);
};

interface UsePlaylistSaveSubmitOptions {
  mode: 'create' | 'edit';
  /** Target playlist in edit mode; `null` in create mode until saved. */
  playlistId: string | null;
  /** Items to seed a newly created playlist with (create mode only). */
  pendingItemRefs: PlaylistItemSourceRef[];
  /** Surfaces a server-side title error (e.g. duplicate title) on the form. */
  onTitleError: (message: string) => void;
  onSaved: (playlist: PlaylistDetailResponse) => void;
  onOpenChange: (open: boolean) => void;
}

interface UsePlaylistSaveSubmitResult {
  /** True from submit start until the whole create/upload/update chain settles. */
  isSaving: boolean;
  /**
   * Run the save flow for the given form values and (create mode) files staged
   * for post-create upload. Resolves once the flow settles either way.
   */
  submitSave: (values: PlaylistSaveFormValues, pendingFiles: File[]) => Promise<void>;
}

/**
 * Submit orchestration for the playlist save dialog.
 *
 * Calls the playlist server actions directly (NOT the Task 16 mutation hooks —
 * their unwrap discards `fieldErrors`, which this flow maps onto the title
 * field) and reproduces the hooks' cache semantics itself:
 *
 * - after create → seed `playlists.detail(id)` with the response, invalidate
 *   `playlists.mine()` only;
 * - after update → invalidate `playlists.mine()` + `playlists.detail(id)`.
 *
 * Create flow: create (with `pendingItemRefs` as items) → when files are
 * staged, upload them against the new id → attach the uploaded URLs via a
 * follow-up update. Cover-only failures (partial/total upload failure, failed
 * follow-up update) toast an error but still complete the save with the best
 * available playlist — the playlist exists, so the dialog must never stay
 * stuck open on them.
 */
export const usePlaylistSaveSubmit = ({
  mode,
  playlistId,
  pendingItemRefs,
  onTitleError,
  onSaved,
  onOpenChange,
}: UsePlaylistSaveSubmitOptions): UsePlaylistSaveSubmitResult => {
  const queryClient = useQueryClient();
  const { uploadFiles } = usePlaylistCoverUpload();
  const [isSaving, setIsSaving] = useState(false);

  const submitSave = async (
    values: PlaylistSaveFormValues,
    pendingFiles: File[]
  ): Promise<void> => {
    const deps: SaveFlowDeps = { queryClient, uploadFiles, onTitleError, onSaved, onOpenChange };
    setIsSaving(true);
    try {
      if (mode === 'create') {
        await runCreateFlow(deps, pendingItemRefs, values, pendingFiles);
      } else if (playlistId !== null) {
        await runEditFlow(deps, playlistId, values);
      }
    } catch {
      toast.error(GENERIC_SAVE_ERROR);
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, submitSave };
};
