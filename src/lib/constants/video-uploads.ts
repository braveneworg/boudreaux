/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Client-safe constants for the direct-to-S3 multipart video upload flow,
 * plus the key-namespace guard the cleanup paths share.
 *
 * Shared by the admin uploader (client) and the multipart upload Server
 * Actions (server), so this module intentionally carries no `'server-only'`
 * marker and imports nothing from the server bundle.
 */

/** Every video object lives under this S3 key namespace (uploader + cleanup). */
export const VIDEO_KEY_PREFIX = 'media/videos/';

/**
 * True when `key` names an object in our own video namespace — the single
 * authority for the cleanup rule "only ever delete objects under
 * {@link VIDEO_KEY_PREFIX}". An admin-supplied posterUrl could otherwise
 * point deletion at release audio or artist images.
 */
export const isVideoNamespacedKey = (key: string | null | undefined): key is string =>
  key?.startsWith(VIDEO_KEY_PREFIX) ?? false;

/** MIME types accepted for video uploads. */
export const VIDEO_ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm'] as const;

/** Largest video accepted for upload: 5 GB. */
export const VIDEO_MAX_FILE_SIZE = 5 * 1024 ** 3;

/** Size of each multipart part: 100 MB (well above S3's 5 MB part minimum). */
export const VIDEO_PART_SIZE = 100 * 1024 ** 2;

/**
 * Upper bound on the number of parts a single upload may request. Derived from
 * the max file size and part size, plus one part of headroom for the trailing
 * remainder.
 */
export const VIDEO_MAX_PARTS = Math.ceil(VIDEO_MAX_FILE_SIZE / VIDEO_PART_SIZE) + 1;

/** Maximum number of part URLs presigned in a single just-in-time batch. */
export const VIDEO_PART_URL_BATCH_MAX = 5;

/** Number of parts uploaded concurrently by the client. */
export const VIDEO_UPLOAD_CONCURRENCY = 3;
