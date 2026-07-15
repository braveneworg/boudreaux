/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';

import { auth } from '@/auth';
import {
  PLAYLIST_COVER_UPLOAD_LIMIT,
  playlistCoverUploadLimiter,
} from '@/lib/config/rate-limit-tiers';
import { PlaylistService } from '@/lib/services/playlist-service';
import { DataError } from '@/lib/types/domain/errors';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type {
  PlaylistActionResult,
  PlaylistCoverUploadTarget,
  PlaylistDetailResponse,
} from '@/lib/types/domain/playlist';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import { fieldErrorsFromZodIssues } from '@/lib/utils/zod-field-errors';
import {
  createPlaylistInputSchema,
  playlistCoverUploadInputSchema,
  updatePlaylistInputSchema,
} from '@/lib/validation/playlist-schema';
import type { PlaylistCoverUploadInput } from '@/lib/validation/playlist-schema';

const logger = loggers.media;

const UNAUTHORIZED_MESSAGE = 'Unauthorized';
const INVALID_INPUT_MESSAGE = 'Invalid input';
const DUPLICATE_TITLE_MESSAGE = 'A playlist with this title already exists';
const PLAYLIST_NOT_FOUND_MESSAGE = 'Playlist not found';
const PLAYLISTS_PATH = '/playlists';
const UPLOAD_URL_EXPIRY_SECONDS = 900;

/** One file entry of the (already validated) cover-upload input. */
type CoverUploadFile = PlaylistCoverUploadInput['files'][number];

/** Zod issues as accepted by {@link fieldErrorsFromZodIssues}. */
type ZodIssues = Parameters<typeof fieldErrorsFromZodIssues>[0];

/** Delete-input guard: the single id field, ObjectId-shaped. */
const deletePlaylistInputSchema = z.object({
  playlistId: z.string().regex(OBJECT_ID_REGEX, 'Invalid id'),
});

/**
 * DataError codes whose service-authored messages are user-facing and safe to
 * surface verbatim ('Playlist not found', item-limit text, cover-image rules).
 */
const USER_FACING_CODES: ReadonlySet<DataErrorCode> = new Set([
  'NOT_FOUND',
  'INVALID_INPUT',
  'LIMIT_EXCEEDED',
]);

/**
 * Resolve the signed-in session user's id, or null when there is no session,
 * the session has no user id, or the account is banned (defense-in-depth on
 * top of the better-auth ban enforcement).
 */
const getAuthorizedUserId = async (): Promise<string | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.banned) return null;
  return user.id;
};

const unauthorizedFailure = (): PlaylistActionResult<never> => ({
  success: false,
  error: UNAUTHORIZED_MESSAGE,
});

/** Map a failed Zod parse into the field-errors failure shape. */
const invalidInputFailure = (issues: ZodIssues): PlaylistActionResult<never> => ({
  success: false,
  error: INVALID_INPUT_MESSAGE,
  fieldErrors: fieldErrorsFromZodIssues(issues, { formKey: '_form' }),
});

/**
 * Map a thrown error to the action failure shape: the unique-title violation
 * (`DataError` code `DUPLICATE` from `@@unique([ownerId, title])`) becomes the
 * friendly message plus a `title` field error; other user-facing `DataError`
 * codes pass their message through; everything else collapses to `fallback`
 * so internals never reach the client.
 */
const failureFromError = (error: unknown, fallback: string): PlaylistActionResult<never> => {
  if (error instanceof DataError) {
    if (error.code === 'DUPLICATE') {
      return {
        success: false,
        error: DUPLICATE_TITLE_MESSAGE,
        fieldErrors: { title: [DUPLICATE_TITLE_MESSAGE] },
      };
    }
    if (USER_FACING_CODES.has(error.code)) {
      return { success: false, error: error.message };
    }
  }
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return { success: false, error: fallback };
};

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
