/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  createPlaylistAction,
  deletePlaylistAction,
  updatePlaylistAction,
} from '@/lib/actions/playlist-actions';
import {
  addPlaylistItemAction,
  removePlaylistItemAction,
  reorderPlaylistItemsAction,
} from '@/lib/actions/playlist-item-actions';
import { queryKeys } from '@/lib/query-keys';
import type {
  PlaylistActionResult,
  PlaylistDetailResponse,
  PlaylistItemPayload,
} from '@/lib/types/domain/playlist';
import type {
  AddPlaylistItemInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  UpdatePlaylistInput,
} from '@/lib/validation/playlist-schema';

import { PlaylistActionError } from './playlist-action-error';

/**
 * Unwrap a {@link PlaylistActionResult}: resolve with the success payload, or
 * throw a {@link PlaylistActionError} carrying the action's code and copy so
 * the mutation rejects and callers handle the failure via `onError`.
 */
const unwrapActionResult = async <T>(
  resultPromise: Promise<PlaylistActionResult<T>>
): Promise<T> => {
  const result = await resultPromise;
  if (!result.success) throw new PlaylistActionError(result.code, result.error);
  return result.data;
};

/** Invalidate the My Playlists listing cache. */
const invalidateMine = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.playlists.mine() });

/** Invalidate the My Playlists listing cache plus one playlist's detail cache. */
const invalidateMineAndDetail = (queryClient: QueryClient, playlistId: string): Promise<unknown> =>
  Promise.all([
    invalidateMine(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.detail(playlistId) }),
  ]);

/**
 * Mutation hook wrapping {@link createPlaylistAction}. A failure result rejects
 * with the action's error message (handle via `onError`). On success the
 * returned {@link PlaylistDetailResponse} seeds the `playlists.detail(id)`
 * cache directly and the `playlists.mine()` listing is invalidated.
 */
export const useCreatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createPlaylist,
    mutateAsync: createPlaylistAsync,
    isPending: isCreatingPlaylist,
    isError: isCreatePlaylistError,
    error: createPlaylistError,
    data: createdPlaylist,
    reset: resetCreatePlaylist,
  } = useMutation<PlaylistDetailResponse, Error, CreatePlaylistInput>({
    mutationFn: (input) => unwrapActionResult(createPlaylistAction(input)),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.playlists.detail(detail.id), detail);
      return invalidateMine(queryClient);
    },
  });

  return {
    createPlaylist,
    createPlaylistAsync,
    isCreatingPlaylist,
    isCreatePlaylistError,
    createPlaylistError,
    createdPlaylist,
    resetCreatePlaylist,
  };
};

/**
 * Mutation hook wrapping {@link updatePlaylistAction}. A failure result rejects
 * with the action's error message; on success the `playlists.mine()` listing
 * and the playlist's `playlists.detail(id)` caches are invalidated.
 */
export const useUpdatePlaylistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updatePlaylist,
    mutateAsync: updatePlaylistAsync,
    isPending: isUpdatingPlaylist,
    isError: isUpdatePlaylistError,
    error: updatePlaylistError,
    data: updatedPlaylist,
    reset: resetUpdatePlaylist,
  } = useMutation<PlaylistDetailResponse, Error, UpdatePlaylistInput>({
    mutationFn: (input) => unwrapActionResult(updatePlaylistAction(input)),
    onSuccess: (_detail, { playlistId }) => invalidateMineAndDetail(queryClient, playlistId),
  });

  return {
    updatePlaylist,
    updatePlaylistAsync,
    isUpdatingPlaylist,
    isUpdatePlaylistError,
    updatePlaylistError,
    updatedPlaylist,
    resetUpdatePlaylist,
  };
};

/**
 * Mutation hook wrapping {@link deletePlaylistAction}. A failure result rejects
 * with the action's error message; on success the `playlists.mine()` listing
 * and the deleted playlist's `playlists.detail(id)` caches are invalidated
 * (invalidate-only, mirroring the tour-date delete hook).
 */
export const useDeletePlaylistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deletePlaylist,
    mutateAsync: deletePlaylistAsync,
    isPending: isDeletingPlaylist,
    isError: isDeletePlaylistError,
    error: deletePlaylistError,
    reset: resetDeletePlaylist,
  } = useMutation<{ deleted: true }, Error, { playlistId: string }>({
    mutationFn: (input) => unwrapActionResult(deletePlaylistAction(input)),
    onSuccess: (_result, { playlistId }) => invalidateMineAndDetail(queryClient, playlistId),
  });

  return {
    deletePlaylist,
    deletePlaylistAsync,
    isDeletingPlaylist,
    isDeletePlaylistError,
    deletePlaylistError,
    resetDeletePlaylist,
  };
};

/**
 * Mutation hook wrapping {@link addPlaylistItemAction}. Like its siblings, a
 * failure result rejects with a {@link PlaylistActionError}; an already-present
 * source rejects with code `DUPLICATE_ITEM`, which the add-to-playlist module
 * (`useAddToPlaylist`) turns into a confirm and a `force: true` retry. On
 * success the `playlists.mine()` listing and the playlist's
 * `playlists.detail(id)` caches are invalidated.
 */
export const useAddPlaylistItemMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: addPlaylistItem,
    mutateAsync: addPlaylistItemAsync,
    isPending: isAddingPlaylistItem,
    isError: isAddPlaylistItemError,
    error: addPlaylistItemError,
    data: addedPlaylistItem,
    reset: resetAddPlaylistItem,
  } = useMutation<{ item: PlaylistItemPayload }, Error, AddPlaylistItemInput>({
    mutationFn: (input) => unwrapActionResult(addPlaylistItemAction(input)),
    onSuccess: (_result, { playlistId }) => invalidateMineAndDetail(queryClient, playlistId),
  });

  return {
    addPlaylistItem,
    addPlaylistItemAsync,
    isAddingPlaylistItem,
    isAddPlaylistItemError,
    addPlaylistItemError,
    addedPlaylistItem,
    resetAddPlaylistItem,
  };
};

/**
 * Mutation hook wrapping {@link removePlaylistItemAction}. A failure result
 * rejects with the action's error message; on success the `playlists.mine()`
 * listing and the playlist's `playlists.detail(id)` caches are invalidated.
 */
export const useRemovePlaylistItemMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: removePlaylistItem,
    mutateAsync: removePlaylistItemAsync,
    isPending: isRemovingPlaylistItem,
    isError: isRemovePlaylistItemError,
    error: removePlaylistItemError,
    reset: resetRemovePlaylistItem,
  } = useMutation<{ removed: true }, Error, { playlistId: string; itemId: string }>({
    mutationFn: (input) => unwrapActionResult(removePlaylistItemAction(input)),
    onSuccess: (_result, { playlistId }) => invalidateMineAndDetail(queryClient, playlistId),
  });

  return {
    removePlaylistItem,
    removePlaylistItemAsync,
    isRemovingPlaylistItem,
    isRemovePlaylistItemError,
    removePlaylistItemError,
    resetRemovePlaylistItem,
  };
};

/**
 * Mutation hook wrapping {@link reorderPlaylistItemsAction}. A failure result
 * rejects with the action's error message; on success the `playlists.mine()`
 * listing and the playlist's `playlists.detail(id)` caches are invalidated.
 */
export const useReorderPlaylistItemsMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: reorderPlaylistItems,
    mutateAsync: reorderPlaylistItemsAsync,
    isPending: isReorderingPlaylistItems,
    isError: isReorderPlaylistItemsError,
    error: reorderPlaylistItemsError,
    reset: resetReorderPlaylistItems,
  } = useMutation<{ reordered: true }, Error, ReorderPlaylistItemsInput>({
    mutationFn: (input) => unwrapActionResult(reorderPlaylistItemsAction(input)),
    onSuccess: (_result, { playlistId }) => invalidateMineAndDetail(queryClient, playlistId),
  });

  return {
    reorderPlaylistItems,
    reorderPlaylistItemsAsync,
    isReorderingPlaylistItems,
    isReorderPlaylistItemsError,
    reorderPlaylistItemsError,
    resetReorderPlaylistItems,
  };
};
