/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Digital Format Constants
 *
 * File size limits, MIME types, and configuration for digital audio format management.
 * Feature: 004-release-digital-formats
 */

/**
 * Per-file size limits per format type (in bytes)
 *
 * Maximum size for any individual track file within a format.
 * These are the per-track limits; the total combined limit is in FORMAT_TOTAL_SIZE_LIMITS.
 */
export const FORMAT_SIZE_LIMITS = {
  MP3_V0: 50 * 1024 * 1024, // 50MB per track
  MP3_320KBPS: 50 * 1024 * 1024, // 50MB per track
  AAC: 50 * 1024 * 1024, // 50MB per track
  OGG_VORBIS: 50 * 1024 * 1024, // 50MB per track
  FLAC: 150 * 1024 * 1024, // 150MB per track
  ALAC: 150 * 1024 * 1024, // 150MB per track
  WAV: 300 * 1024 * 1024, // 300MB per track
  AIFF: 300 * 1024 * 1024, // 300MB per track
} as const;

/**
 * Total combined size limits per format type (in bytes)
 *
 * Maximum sum of all track file sizes within a single format for a release.
 */
export const FORMAT_TOTAL_SIZE_LIMITS = {
  MP3_V0: 1 * 1024 * 1024 * 1024, // 1GB total
  MP3_320KBPS: 1 * 1024 * 1024 * 1024, // 1GB total
  AAC: 1 * 1024 * 1024 * 1024, // 1GB total
  OGG_VORBIS: 1 * 1024 * 1024 * 1024, // 1GB total
  FLAC: 2.5 * 1024 * 1024 * 1024, // 2.5GB total
  ALAC: 2.5 * 1024 * 1024 * 1024, // 2.5GB total
  WAV: 5 * 1024 * 1024 * 1024, // 5GB total
  AIFF: 5 * 1024 * 1024 * 1024, // 5GB total
} as const;

/**
 * Maximum number of track files per format per release
 */
export const MAX_TRACKS_PER_FORMAT = 100;

/**
 * MIME type allowlist per format type
 *
 * Multiple MIME types per format to handle browser and OS differences.
 * Used for validation during upload and Content-Type header generation.
 */
export const FORMAT_MIME_TYPES = {
  MP3_V0: ['audio/mpeg', 'audio/mp3'],
  MP3_320KBPS: ['audio/mpeg', 'audio/mp3'],
  AAC: ['audio/aac', 'audio/x-aac', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'],
  OGG_VORBIS: ['audio/ogg', 'audio/vorbis', 'application/ogg'],
  FLAC: ['audio/flac', 'audio/x-flac'],
  ALAC: ['audio/x-m4a', 'audio/m4a', 'audio/mp4'],
  WAV: ['audio/wav', 'audio/x-wav', 'audio/wave'],
  AIFF: ['audio/aiff', 'audio/x-aiff'],
} as const;

/**
 * Freemium download quota limit
 *
 * Maximum number of unique releases a user can download for free
 * before being required to purchase releases.
 */
export const MAX_FREE_DOWNLOAD_QUOTA = 5;

/**
 * Soft delete grace period in days (for purchasers)
 *
 * After a digital format is soft deleted (deletedAt timestamp set),
 * purchasers can still download it for this many days.
 * Non-purchasers are immediately blocked from accessing deleted formats.
 */
export const SOFT_DELETE_GRACE_PERIOD_DAYS = 90;

/**
 * Replaced file archive retention in days
 *
 * When a digital format file is replaced, the old S3 object is archived
 * for this many days before permanent deletion.
 */
export const FILE_REPLACEMENT_ARCHIVE_DAYS = 30;

/**
 * Presigned URL expiration times (in seconds)
 *
 * - UPLOAD: 15 minutes (900 seconds) - Short-lived for security, admin uploads
 * - DOWNLOAD: 24 hours (86400 seconds) - Longer-lived for user convenience, retry support
 */
export const PRESIGNED_URL_EXPIRATION = {
  UPLOAD: 15 * 60, // 15 minutes
  DOWNLOAD: 24 * 60 * 60, // 24 hours
} as const;

/**
 * Type guard utility for format type validation
 */
export type DigitalFormatType = keyof typeof FORMAT_SIZE_LIMITS;

/**
 * Valid digital format types (for runtime validation)
 */
export const VALID_FORMAT_TYPES: ReadonlyArray<DigitalFormatType> = [
  'MP3_V0',
  'MP3_320KBPS',
  'AAC',
  'OGG_VORBIS',
  'FLAC',
  'ALAC',
  'WAV',
  'AIFF',
] as const;

/**
 * S3 key pattern generator utility
 *
 * @param releaseId - MongoDB ObjectId of the release
 * @param formatType - Digital format type
 * @param fileId - Unique file identifier (UUID)
 * @param extension - File extension (mp3, flac, wav, aac)
 * @returns S3 object key in the format: releases/{releaseId}/digital-formats/{formatType}/{fileId}.{ext}
 */
export function generateS3Key(
  releaseId: string,
  formatType: DigitalFormatType,
  fileId: string,
  extension: string
): string {
  return `releases/${releaseId}/digital-formats/${formatType}/${fileId}.${extension}`;
}

/**
 * Get file extension from format type
 */
export function getFileExtensionForFormat(formatType: DigitalFormatType): string {
  const extensionMap: Record<DigitalFormatType, string> = {
    MP3_V0: 'mp3',
    MP3_320KBPS: 'mp3',
    AAC: 'aac',
    OGG_VORBIS: 'ogg',
    FLAC: 'flac',
    ALAC: 'm4a',
    WAV: 'wav',
    AIFF: 'aiff',
  };
  return extensionMap[formatType];
}

/**
 * Get default MIME type for format (first in allowlist)
 */
export function getDefaultMimeType(formatType: DigitalFormatType): string {
  return FORMAT_MIME_TYPES[formatType][0];
}
