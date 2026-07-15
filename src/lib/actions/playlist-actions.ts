/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

import {
  PLAYLIST_COVER_UPLOAD_LIMIT,
  playlistCoverUploadLimiter,
} from '@/lib/config/rate-limit-tiers';
import { PlaylistService } from '@/lib/services/playlist-service';
import type {
  PlaylistActionResult,
  PlaylistCoverUploadTarget,
  PlaylistDetailResponse,
} from '@/lib/types/domain/playlist';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import {
  createPlaylistInputSchema,
  playlistCoverUploadInputSchema,
  updatePlaylistInputSchema,
} from '@/lib/validation/playlist-schema';
import type { PlaylistCoverUploadInput } from '@/lib/validation/playlist-schema';

import {
  failureFromError,
  getAuthorizedUserId,
  invalidInputFailure,
  PLAYLISTS_PATH,
  unauthorizedFailure,
} from './playlist-action-helpers';

const PLAYLIST_NOT_FOUND_MESSAGE = 'Playlist not found';
const UPLOAD_URL_EXPIRY_SECONDS = 900;

/** One file entry of the (already validated) cover-upload input. */
type CoverUploadFile = PlaylistCoverUploadInput['files'][number];

/** Delete-input guard: the single id field, ObjectId-shaped. */
const deletePlaylistInputSchema = z.object({
  playlistId: z.string().regex(OBJECT_ID_REGEX, 'Invalid id'),
});

/**
 * Build the S3 object key for one playlist cover upload:
 * `media/playlists/{playlistId}/{sanitized}-{ts}-{rand}.{ext}`
 * (same sanitize/key pattern as the admin presigned-upload action).
 */
const buildCoverObjectKey = (playlistId: string, fileName: string): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 50);
  return `media/playlists/${playlistId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

/**
 * Mint one presigned PUT (content type and length reflected into the
 * signature) plus the CDN public URL for a single cover file.
 */
const buildCoverUploadTarget = async (
  playlistId: string,
  { fileName, contentType, fileSize }: CoverUploadFile
): Promise<PlaylistCoverUploadTarget> => {
  const key = buildCoverObjectKey(playlistId, fileName);
  const command = new PutObjectCommand({
    Bucket: getS3BucketName(),
    Key: key,
    ContentType: contentType,
    ContentLength: fileSize,
    CacheControl: 'public, max-age=31536000, immutable',
  });
  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });
  return { uploadUrl, key, publicUrl: buildCdnUrl(key) };
};

/**
 * Create a playlist owned by the current user, optionally seeded with items.
 * Returns the resolved detail payload and revalidates the playlists page.
 */
export const createPlaylistAction = async (
  input: unknown
): Promise<PlaylistActionResult<PlaylistDetailResponse>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = createPlaylistInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    const detail = await PlaylistService.createWithItems(userId, parsed.data);
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: detail };
  } catch (error) {
    return failureFromError(error, 'Failed to create playlist');
  }
};

/**
 * Update an owned playlist's title, visibility, and/or cover images, then
 * return the refreshed detail payload.
 */
export const updatePlaylistAction = async (
  input: unknown
): Promise<PlaylistActionResult<PlaylistDetailResponse>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = updatePlaylistInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    await PlaylistService.update(userId, parsed.data);
    revalidatePath(PLAYLISTS_PATH);
    const detail = await PlaylistService.getOwnedOrPublicDetail(parsed.data.playlistId, userId);
    if (!detail) return { success: false, error: PLAYLIST_NOT_FOUND_MESSAGE };
    return { success: true, data: detail };
  } catch (error) {
    return failureFromError(error, 'Failed to update playlist');
  }
};

/** Delete an owned playlist (its items cascade at the repository layer). */
export const deletePlaylistAction = async (input: {
  playlistId: string;
}): Promise<PlaylistActionResult<{ deleted: true }>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = deletePlaylistInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    await PlaylistService.delete(userId, parsed.data.playlistId);
    revalidatePath(PLAYLISTS_PATH);
    return { success: true, data: { deleted: true } };
  } catch (error) {
    return failureFromError(error, 'Failed to delete playlist');
  }
};

/**
 * Mint presigned S3 PUT URLs (15 min expiry) for playlist cover uploads,
 * keyed under `media/playlists/{playlistId}/`. Rate-limited per user, and the
 * playlist must be owned by the caller. `publicUrl` is the CDN URL the client
 * stores in `coverImages` after a successful PUT.
 */
export const generatePlaylistCoverUploadUrlsAction = async (
  input: unknown
): Promise<PlaylistActionResult<PlaylistCoverUploadTarget[]>> => {
  const userId = await getAuthorizedUserId();
  if (!userId) return unauthorizedFailure();
  const parsed = playlistCoverUploadInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);
  try {
    await playlistCoverUploadLimiter.check(PLAYLIST_COVER_UPLOAD_LIMIT, userId);
  } catch {
    return { success: false, error: 'RATE_LIMITED' };
  }
  try {
    await PlaylistService.requireOwned(parsed.data.playlistId, userId);
    const targets = await Promise.all(
      parsed.data.files.map((file) => buildCoverUploadTarget(parsed.data.playlistId, file))
    );
    return { success: true, data: targets };
  } catch (error) {
    return failureFromError(error, 'Failed to generate upload URLs');
  }
};
