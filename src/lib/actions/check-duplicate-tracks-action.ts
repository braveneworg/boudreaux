/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { requireRole } from '@/lib/utils/auth/require-role';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';

import { prisma } from '../prisma';

/**
 * Information about a track that already exists with a matching file hash
 */
export interface ExistingTrackInfo {
  /** The hash that matched */
  audioFileHash: string;
  /** The existing track's database ID */
  trackId: string;
  /** The existing track's title */
  title: string;
  /** The existing track's audio URL (current S3/CDN path) */
  audioUrl: string;
  /** The existing track's upload status */
  audioUploadStatus: string;
  /** Pre-extracted S3 key from the audioUrl, or null if not extractable (e.g., pending://upload) */
  existingS3Key: string | null;
}

/**
 * Result of the duplicate check
 */
export interface CheckDuplicateTracksResult {
  success: boolean;
  /** Array of existing track info for hashes that were found in the database */
  duplicates: ExistingTrackInfo[];
  error?: string;
}

/**
 * Check which audio file hashes already exist in the database.
 * Used during bulk upload to detect duplicate files before creating new records.
 *
 * @param hashes - Array of SHA-256 hashes to check
 * @returns Array of ExistingTrackInfo for hashes that match existing tracks
 */
export async function checkDuplicateTracksAction(
  hashes: string[]
): Promise<CheckDuplicateTracksResult> {
  await requireRole('admin');

  try {
    if (!hashes || hashes.length === 0) {
      return { success: true, duplicates: [] };
    }

    // Filter out empty/null hashes
    const validHashes = hashes.filter((h) => h && h.trim() !== '');

    if (validHashes.length === 0) {
      return { success: true, duplicates: [] };
    }

    // Query all tracks that have matching hashes (excluding soft-deleted tracks)
    const existingTracks = await prisma.track.findMany({
      where: {
        audioFileHash: { in: validHashes },
        deletedOn: null,
      },
      select: {
        id: true,
        title: true,
        audioUrl: true,
        audioFileHash: true,
        audioUploadStatus: true,
      },
    });

    const duplicates: ExistingTrackInfo[] = existingTracks
      .filter(
        (track): track is typeof track & { audioFileHash: string } => track.audioFileHash != null
      )
      .map((track) => ({
        audioFileHash: track.audioFileHash,
        trackId: track.id,
        title: track.title,
        audioUrl: track.audioUrl,
        audioUploadStatus: track.audioUploadStatus,
        existingS3Key: extractS3KeyFromUrl(track.audioUrl),
      }));

    return { success: true, duplicates };
  } catch (error) {
    console.error('Error checking duplicate tracks:', error);
    return {
      success: false,
      duplicates: [],
      error: error instanceof Error ? error.message : 'Failed to check duplicates',
    };
  }
}
