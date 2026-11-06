/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { z } from 'zod';

import { gateAction } from '@/lib/auth/action-gate';
import { PlaylistService } from '@/lib/services/playlist-service';
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

import { failureFromError, invalidInputFailure, PLAYLISTS_PATH } from './playlist-action-helpers';

/**
 * Copy for a `DUPLICATE_ITEM` answer. Callers branch on the code and ask the
 * listener to confirm; the copy is only for a caller that shows it as is.
 */
const DUPLICATE_ITEM_MESSAGE = 'This is already in the playlist';

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
 * Add one track/video to an owned playlist. A duplicate source answers with
 * code `DUPLICATE_ITEM` (no revalidation — nothing changed); the caller
 * confirms and retries with `force: true`. Every other failure keeps the
 * service's code and copy: a full playlist is `LIMIT_EXCEEDED`, and a missing
 * playlist or source is `NOT_FOUND`, each with its own service-authored copy.
 */
export const addPlaylistItemAction = async (
  input: unknown
): Promise<PlaylistActionResult<{ item: PlaylistItemPayload }>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;
  const userId = gate.session.user.id;
  const parsed = addPlaylistItemInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    const result = await PlaylistService.addItem(userId, {
      playlistId: parsed.data.playlistId,
      ref: toSourceRef(parsed.data),
      force: parsed.data.force,
    });
    if (result.duplicate) {
      return { success: false, error: DUPLICATE_ITEM_MESSAGE, code: 'DUPLICATE_ITEM' };
    }
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: { item: result.item } };
  } catch (error) {
    return failureFromError(error, 'Failed to add playlist item');
  }
};

/** Remove one item from an owned playlist. */
export const removePlaylistItemAction = async (input: {
  playlistId: string;
  itemId: string;
}): Promise<PlaylistActionResult<{ removed: true }>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;
  const userId = gate.session.user.id;
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
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;
  const userId = gate.session.user.id;
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
