/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { isVideoNamespacedKey, VIDEO_KEY_PREFIX } from '@/lib/constants/video-uploads';
import type {
  CreateVideoData,
  UpdateVideoData,
  Video,
  VideoPosterCandidate,
} from '@/lib/types/domain/video';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { isInvalidS3Key } from './confirm-upload-action-helpers';
import { isLocalMultipartUpload, localObjectExists } from './multipart-local-adapters';

/** FormData fields the create/update video actions accept (preGeneratedId read raw). */
export const VIDEO_PERMITTED_FIELD_NAMES = [
  'title',
  'artist',
  'category',
  'description',
  'releasedOn',
  'durationSeconds',
  's3Key',
  'fileName',
  'fileSize',
  'mimeType',
  'posterUrl',
  'posterCandidates',
  'publishedAt',
  'artistDetails',
  'producers',
] as const;

/** Coerce a string-or-number duration to a positive integer, or `undefined`. */
export const parseDurationSeconds = (value: string | number | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  return typeof value === 'number' ? value : parseInt(value, 10);
};

/** Coerce a string-or-number byte count to a `bigint`, or `undefined`. */
export const parseFileSize = (value: string | number | undefined): bigint | undefined => {
  if (value === undefined || value === '') return undefined;
  return BigInt(value);
};

/**
 * Whether the uploaded object is really there — an S3 HEAD, or the local
 * upload store's record of a completed multipart upload when there is no AWS.
 *
 * The local answer is a real one: only a key the browser actually finished
 * uploading passes. This used to be an unconditional `return null` in E2E,
 * which meant the check was not merely faked but skipped — a create that never
 * uploaded anything confirmed happily.
 */
const objectExists = async (s3Key: string): Promise<boolean> =>
  isLocalMultipartUpload() ? localObjectExists(s3Key) : verifyS3ObjectExists(s3Key);

/**
 * Confirm the uploaded S3 object for a video create/replace: the key must sit
 * under `media/videos/{videoId}/` (no traversal) and the object must exist.
 * Returns a user-facing error message, or `null` when the object is confirmed.
 */
export const confirmVideoUpload = async (
  s3Key: string,
  videoId: string | undefined
): Promise<string | null> => {
  const expectedPrefix = `${VIDEO_KEY_PREFIX}${videoId}/`;
  if (videoId === undefined || isInvalidS3Key(s3Key, expectedPrefix)) {
    return `Invalid S3 key: must start with ${expectedPrefix}`;
  }
  if (!(await objectExists(s3Key))) {
    return 'File not found in S3 storage. Upload may have failed.';
  }
  return null;
};

/**
 * Build the repository create payload from parsed form data. The
 * pre-generated ObjectId becomes the document id (threaded structurally into
 * the Prisma create, mirroring the release create), and `createdBy` is stamped.
 * `candidates` — resolved by the caller via {@link resolvePersistableCandidates}
 * — is included only when defined.
 */
export const buildVideoCreateInput = (
  data: VideoFormData,
  preGeneratedId: string | undefined,
  userId: string,
  candidates: VideoPosterCandidate[] | undefined
): CreateVideoData => ({
  ...(preGeneratedId !== undefined ? { id: preGeneratedId } : {}),
  title: data.title,
  artist: data.artist,
  category: data.category,
  description: data.description || undefined,
  releasedOn: new Date(data.releasedOn),
  durationSeconds: parseDurationSeconds(data.durationSeconds),
  s3Key: data.s3Key,
  fileName: data.fileName,
  fileSize: parseFileSize(data.fileSize),
  mimeType: data.mimeType,
  posterUrl: data.posterUrl || undefined,
  ...(candidates !== undefined ? { posterCandidates: candidates } : {}),
  publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
  createdBy: userId,
});

/** Build the repository update payload from parsed form data, stamping `updatedBy`. */
export const buildVideoUpdateInput = (data: VideoFormData, userId: string): UpdateVideoData => ({
  title: data.title,
  artist: data.artist,
  category: data.category,
  description: data.description || undefined,
  releasedOn: new Date(data.releasedOn),
  durationSeconds: parseDurationSeconds(data.durationSeconds),
  s3Key: data.s3Key,
  fileName: data.fileName,
  fileSize: parseFileSize(data.fileSize),
  mimeType: data.mimeType,
  posterUrl: data.posterUrl || undefined,
  publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
  updatedBy: userId,
});

/**
 * Whether the update supplies a new, non-empty poster that differs from the
 * current one (i.e. the poster is being replaced, so the old key can be freed).
 */
export const isPosterReplaced = (current: Video, data: VideoFormData): boolean =>
  data.posterUrl !== undefined && data.posterUrl !== '' && data.posterUrl !== current.posterUrl;

/**
 * Whether EVERY candidate URL resolves to an S3 key inside this video's own
 * namespace (`media/videos/{videoId}/…`) — the write-path injection guard for
 * admin-supplied candidate lists.
 */
export const areCandidatesForVideo = (
  candidates: VideoPosterCandidate[],
  videoId: string
): boolean =>
  candidates.every((candidate) =>
    (extractS3KeyFromUrl(candidate.url) ?? '').startsWith(`${VIDEO_KEY_PREFIX}${videoId}/`)
  );

/**
 * Candidate list an action may persist: present, namespaced to THIS video, and
 * — for updates — only alongside an actual file replace (`s3KeyReplaced`).
 * Anything else resolves to `undefined` (field omitted; never blocks the save).
 */
export const resolvePersistableCandidates = (
  data: VideoFormData,
  videoId: string | undefined,
  s3KeyReplaced: boolean
): VideoPosterCandidate[] | undefined =>
  s3KeyReplaced &&
  videoId !== undefined &&
  data.posterCandidates !== undefined &&
  data.posterCandidates.length > 0 &&
  areCandidatesForVideo(data.posterCandidates, videoId)
    ? data.posterCandidates
    : undefined;

/** Whether `url` is one of the video's stored candidate frames. */
const isStoredCandidateUrl = (current: Video, url: string | null): boolean =>
  url !== null && current.posterCandidates.some((candidate) => candidate.url === url);

/**
 * The old candidate key the live poster still points at, or `null`. Only an
 * UNCHANGED `posterUrl` retains one: a replace that ships its own new poster
 * (the normal path — spec §7 replaces both halves) leaves nothing behind.
 */
const retainedPosterKey = (current: Video, data: VideoFormData): string | null =>
  current.posterUrl && data.posterUrl === current.posterUrl
    ? extractS3KeyFromUrl(current.posterUrl)
    : null;

/**
 * Old candidate keys freed when a file replace ships a fresh candidate set —
 * except the object an unchanged `posterUrl` still references. Deleting that
 * one would leave the row pointing at a 404 poster on every surface.
 */
const replacedCandidateKeys = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): string[] => {
  if (!s3KeyReplaced || data.posterCandidates === undefined) return [];
  const retained = retainedPosterKey(current, data);
  return current.posterCandidates
    .map((candidate) => extractS3KeyFromUrl(candidate.url))
    .filter(isVideoNamespacedKey)
    .filter((key) => key !== retained);
};

/**
 * Best-effort, fire-and-forget cleanup of S3 objects a successful update
 * orphaned: the old video key (file replaced), the old poster key (poster
 * replaced — unless it is a stored candidate, which must survive a
 * candidate-to-candidate switch), and the old candidate set (file replaced
 * with a fresh capture, minus whichever frame an unchanged poster still
 * points at). Failures are swallowed by {@link deleteS3Object}.
 */
export const deleteReplacedVideoAssets = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): void => {
  const keysToDelete: string[] = [];

  if (s3KeyReplaced) {
    keysToDelete.push(current.s3Key);
  }
  keysToDelete.push(...replacedCandidateKeys(current, data, s3KeyReplaced));
  if (
    isPosterReplaced(current, data) &&
    current.posterUrl &&
    !isStoredCandidateUrl(current, current.posterUrl)
  ) {
    const oldPosterKey = extractS3KeyFromUrl(current.posterUrl);
    if (isVideoNamespacedKey(oldPosterKey) && !keysToDelete.includes(oldPosterKey)) {
      keysToDelete.push(oldPosterKey);
    }
  }
  if (keysToDelete.length === 0) return;

  Promise.allSettled(keysToDelete.map((key) => deleteS3Object(key))).catch(() => {
    // Silently ignore — S3 cleanup is best-effort.
  });
};
