/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { PlaylistService, SOURCE_NOT_FOUND_MESSAGE } from '@/lib/services/playlist-service';
import { DataError } from '@/lib/types/domain/errors';
import type {
  PlaylistActionResult,
  PlaylistItemPayload,
  PlaylistItemSourceRef,
} from '@/lib/types/domain/playlist';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import {
  addPlaylistItemInputSchema,
  reorderPlaylistItemsInputSchema,
} from '@/lib/validation/playlist-schema';
import type { AddPlaylistItemInput } from '@/lib/validation/playlist-schema';

import {
  failureFromError,
  getAuthorizedUserId,
  invalidInputFailure,
  PLAYLISTS_PATH,
  unauthorizedFailure,
} from './playlist-action-helpers';

/** Signal the client switches on to open the duplicate-confirm dialog. */
const DUPLICATE_ITEM_ERROR = 'DUPLICATE_ITEM';
/** Signal for the 200-item cap (service `LIMIT_EXCEEDED`). */
const PLAYLIST_FULL_ERROR = 'PLAYLIST_FULL';
/** Signal for an add whose source track/video no longer resolves. */
const SOURCE_NOT_FOUND_ERROR = 'SOURCE_NOT_FOUND';

/** Remove-input guard: both ids ObjectId-shaped. */
const removePlaylistItemInputSchema = z.object({
  playlistId: z.string().regex(OBJECT_ID_REGEX, 'Invalid id'),
  itemId: z.string().regex(OBJECT_ID_REGEX, 'Invalid id'),
});

/** Split the validated add input into the service's source ref shape. */
const toSourceRef = (data: AddPlaylistItemInput): PlaylistItemSourceRef =>
  data.itemType === 'track'
    ? { itemType: 'track', trackFileId: data.trackFileId }
    : { itemType: 'video', videoId: data.videoId };

/**
 * Add-specific failure mapping ahead of the shared one: the item cap becomes
 * the `PLAYLIST_FULL` signal, and the source-resolution `NOT_FOUND` (matched
 * by the service's exported message — same code as the playlist `NOT_FOUND`)
 * becomes `SOURCE_NOT_FOUND`. Everything else defers to `failureFromError`,
 * so a missing/unowned playlist still surfaces as 'Playlist not found'.
 */
const addItemFailure = (error: unknown): PlaylistActionResult<never> => {
  if (error instanceof DataError) {
    if (error.code === 'LIMIT_EXCEEDED') {
      return { success: false, error: PLAYLIST_FULL_ERROR };
    }
    if (error.code === 'NOT_FOUND' && error.message === SOURCE_NOT_FOUND_MESSAGE) {
      return { success: false, error: SOURCE_NOT_FOUND_ERROR };
    }
  }
  return failureFromError(error, 'Failed to add playlist item');
};

/**
 * Add one track/video to an owned playlist. A duplicate source answers with
 * the exact `DUPLICATE_ITEM` error signal (no revalidation — nothing changed);
 * the caller confirms and retries with `force: true`.
 */
export const addPlaylistItemAction = async (
  input: unknown
): Promise<PlaylistActionResult<{ item: PlaylistItemPayload }>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = addPlaylistItemInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    const result = await PlaylistService.addItem(userId, {
      playlistId: parsed.data.playlistId,
      ref: toSourceRef(parsed.data),
      force: parsed.data.force,
    });
    if (result.duplicate) return { success: false, error: DUPLICATE_ITEM_ERROR };
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: { item: result.item } };
  } catch (error) {
    return addItemFailure(error);
  }
};

/** Remove one item from an owned playlist. */
export const removePlaylistItemAction = async (input: {
  playlistId: string;
  itemId: string;
}): Promise<PlaylistActionResult<{ removed: true }>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = removePlaylistItemInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    await PlaylistService.removeItem(userId, parsed.data.playlistId, parsed.data.itemId);
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: { removed: true } };
  } catch (error) {
    return failureFromError(error, 'Failed to remove playlist item');
  }
};

/**
 * Rewrite the full item order of an owned playlist. The service rejects an
 * id-set mismatch with a user-facing `INVALID_INPUT` message, which passes
 * through as the failure error.
 */
export const reorderPlaylistItemsAction = async (
  input: unknown
): Promise<PlaylistActionResult<{ reordered: true }>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = reorderPlaylistItemsInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    await PlaylistService.reorder(userId, parsed.data.playlistId, parsed.data.orderedItemIds);
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: { reordered: true } };
  } catch (error) {
    return failureFromError(error, 'Failed to reorder playlist items');
  }
};
