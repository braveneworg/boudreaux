/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { VIDEO_KEY_PREFIX } from '@/lib/constants/video-uploads';
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';
import { ProducerService } from '@/lib/services/producer-service';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import type {
  CreateVideoData,
  UpdateVideoData,
  Video,
  VideoCategory,
} from '@/lib/types/domain/video';
import { loggers } from '@/lib/utils/logger';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import type { VideoProducerInput } from '@/lib/validation/video-producer-schema';

import { isInvalidS3Key } from './confirm-upload-action-helpers';

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
  'publishedAt',
  'artistDetails',
  'producers',
];

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
  const exists = await verifyS3ObjectExists(s3Key);
  if (!exists) {
    return 'File not found in S3 storage. Upload may have failed.';
  }
  return null;
};

/**
 * Build the repository create payload from parsed form data. The
 * pre-generated ObjectId becomes the document id (threaded structurally into
 * the Prisma create, mirroring the release create), and `createdBy` is stamped.
 */
export const buildVideoCreateInput = (
  data: VideoFormData,
  preGeneratedId: string | undefined,
  userId: string
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
 * Best-effort, fire-and-forget cleanup of S3 objects a successful update
 * orphaned: the old video key (when the file was replaced) and the old poster
 * key (when the poster was replaced). Failures are swallowed by
 * {@link deleteS3Object}, which logs and never throws; lifecycle rules sweep the
 * rest.
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
  if (isPosterReplaced(current, data) && current.posterUrl) {
    const oldPosterKey = extractS3KeyFromUrl(current.posterUrl);
    // Only ever delete poster objects in our own namespace — an admin-supplied
    // posterUrl could otherwise point cleanup at release audio or artist images.
    if (oldPosterKey?.startsWith(VIDEO_KEY_PREFIX)) keysToDelete.push(oldPosterKey);
  }
  if (keysToDelete.length === 0) return;

  Promise.allSettled(keysToDelete.map((key) => deleteS3Object(key))).catch(() => {
    // Silently ignore — S3 cleanup is best-effort.
  });
};

const logger = loggers.media;

/** Safe, always-string rendering of an unknown error. */
const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The linked artist's matchable display name (mirrors the enrichment service). */
const linkedNameFor = (row: VideoArtistWithArtist): string =>
  (
    row.artist.displayName?.trim() || `${row.artist.firstName} ${row.artist.surname}`.trim()
  ).toLowerCase();

/** True when one provided part differs from the stored value (undefined = not provided). */
const detailPartDiffers = (stored: string | null, provided: string | undefined): boolean =>
  provided !== undefined && (stored ?? '').trim() !== provided.trim();

/**
 * True when any admin-reviewed artist detail actually differs from the linked
 * artists' stored name parts (an unmatched sourceName counts as a change).
 * Lets the update action skip re-kicking enrichment for a no-op save.
 */
export const artistDetailsDiffer = (
  details: VideoArtistDetail[],
  rows: VideoArtistWithArtist[]
): boolean =>
  details.some((detail) => {
    const match = rows.find((row) => linkedNameFor(row) === detail.sourceName.trim().toLowerCase());
    if (!match) return true;
    return (
      detailPartDiffers(match.artist.firstName, detail.firstName) ||
      detailPartDiffers(match.artist.middleName, detail.middleName) ||
      detailPartDiffers(match.artist.surname, detail.surname) ||
      detailPartDiffers(match.artist.displayName, detail.displayName)
    );
  });

/** Input for the post-save enrichment kick (runs inside `after()`). */
export interface KickPostSaveEnrichmentInput {
  videoId: string;
  /** The admin-entered display artist string — the source of the artist sync. */
  artist: string;
  category: VideoCategory;
  /** Probe (or re-probe) the file — true on create and on file replacement. */
  reProbe: boolean;
  /** Admin-reviewed artist name details forwarded to syncVideoArtists. */
  artistDetails?: VideoArtistDetail[];
}

/**
 * Post-save enrichment kick: sync `VideoArtist` links from the artist string,
 * probe the file when it is new/replaced, then dispatch the async web
 * enrichment for MUSIC videos. Each stage is independently best-effort — a
 * failure is logged and the remaining stages still run. Never throws, so the
 * admin's already-successful save can never be failed retroactively by
 * background work.
 *
 * When `artist` is blank (e.g. a draft row created before the admin typed one),
 * the artist-sync and enrichment-dispatch stages are skipped entirely — no
 * "Unknown Artist" shell is ever minted. The probe stage still runs regardless
 * of whether an artist is present.
 *
 * Producer sync is intentionally NOT performed here — see
 * {@link syncVideoProducersAfterSave} which runs in a separate `after()` call
 * so that clearing all producers (producers: []) is always persisted regardless
 * of whether any enrichment-relevant field changed.
 */
export const kickPostSaveEnrichment = async ({
  videoId,
  artist,
  category,
  reProbe,
  artistDetails,
}: KickPostSaveEnrichmentInput): Promise<void> => {
  const hasArtist = artist.trim() !== '';

  if (hasArtist) {
    try {
      await VideoEnrichmentService.syncVideoArtists(videoId, artist, artistDetails);
    } catch (error) {
      logger.warn('Post-save video artist sync failed', { videoId, error: toMessage(error) });
    }
  }

  if (reProbe) {
    try {
      await VideoProbeService.probeAndPersist(videoId);
    } catch (error) {
      logger.warn('Post-save video probe failed', { videoId, error: toMessage(error) });
    }
  }

  if (category === 'MUSIC' && hasArtist) {
    try {
      await VideoEnrichmentService.runEnrichmentJob(videoId);
    } catch (error) {
      logger.warn('Post-save enrichment dispatch failed', { videoId, error: toMessage(error) });
    }
  }
};

/** Best-effort producer-join sync (runs in `after()`, never fails the save). */
export const syncVideoProducersAfterSave = async ({
  videoId,
  producers,
  createdBy,
}: {
  videoId: string;
  producers: VideoProducerInput[];
  createdBy?: string;
}): Promise<void> => {
  try {
    await ProducerService.syncVideoProducers(videoId, producers, createdBy);
  } catch (error) {
    logger.warn('Post-save video producer sync failed', { videoId, error: toMessage(error) });
  }
};
