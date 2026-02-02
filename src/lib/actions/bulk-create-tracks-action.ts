'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

/**
 * Data for a single track in a bulk upload
 */
export interface BulkTrackData {
  /** Track title */
  title: string;
  /** Duration in seconds */
  duration: number;
  /** S3 URL of the uploaded audio file */
  audioUrl: string;
  /** Track position/number */
  position?: number;
  /** Cover art URL (optional) */
  coverArt?: string;
  /** Album name from metadata (for release association) */
  album?: string;
  /** Year from metadata */
  year?: number;
  /** Full date from metadata */
  date?: string;
  /** Record label from metadata */
  label?: string;
  /** Catalog number from metadata */
  catalogNumber?: string;
  /** Album artist from metadata */
  albumArtist?: string;
  /** Whether the audio is lossless */
  lossless?: boolean;
}

/**
 * Result of creating a single track
 */
export interface BulkTrackResult {
  /** Index of the track in the input array */
  index: number;
  /** Whether the track was created successfully */
  success: boolean;
  /** The created track ID if successful */
  trackId?: string;
  /** The track title */
  title: string;
  /** Error message if failed */
  error?: string;
  /** Associated release ID if one was created/found */
  releaseId?: string;
  /** Associated release title */
  releaseTitle?: string;
  /** Whether the release was newly created */
  releaseCreated?: boolean;
}

/**
 * Result of the bulk track creation action
 */
export interface BulkCreateTracksResult {
  /** Whether the overall operation succeeded (all tracks created) */
  success: boolean;
  /** Number of tracks successfully created */
  successCount: number;
  /** Number of tracks that failed */
  failedCount: number;
  /** Results for each individual track */
  results: BulkTrackResult[];
  /** Overall error message if the operation failed before processing tracks */
  error?: string;
}

/**
 * Create multiple tracks at once from bulk upload
 * Each track can optionally be associated with a release (found or created from metadata)
 *
 * @param tracks - Array of track data to create
 * @param autoCreateRelease - Whether to auto-create releases from album metadata
 * @returns Result with details for each track
 */
export async function bulkCreateTracksAction(
  tracks: BulkTrackData[],
  autoCreateRelease = true
): Promise<BulkCreateTracksResult> {
  await requireRole('admin');

  // Validate input
  if (!tracks || tracks.length === 0) {
    return {
      success: false,
      successCount: 0,
      failedCount: 0,
      results: [],
      error: 'No tracks provided',
    };
  }

  if (tracks.length > 100) {
    return {
      success: false,
      successCount: 0,
      failedCount: tracks.length,
      results: [],
      error: 'Maximum 100 tracks can be uploaded at once',
    };
  }

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return {
        success: false,
        successCount: 0,
        failedCount: tracks.length,
        results: [],
        error: 'You must be a logged in admin user to create tracks',
      };
    }

    const results: BulkTrackResult[] = [];
    const releaseCache = new Map<
      string,
      { releaseId: string; releaseTitle: string; created: boolean }
    >();

    // Process each track
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];

      // Validate required fields
      if (!track.title || track.title.trim() === '') {
        results.push({
          index: i,
          success: false,
          title: track.title || `Track ${i + 1}`,
          error: 'Title is required',
        });
        continue;
      }

      if (!track.audioUrl || track.audioUrl.trim() === '') {
        results.push({
          index: i,
          success: false,
          title: track.title,
          error: 'Audio URL is required',
        });
        continue;
      }

      if (track.duration === undefined || track.duration <= 0) {
        results.push({
          index: i,
          success: false,
          title: track.title,
          error: 'Valid duration is required',
        });
        continue;
      }

      try {
        // Handle release association
        let releaseId: string | undefined;
        let releaseTitle: string | undefined;
        let releaseCreated: boolean | undefined;

        if (autoCreateRelease && track.album && track.album.trim() !== '') {
          const albumKey = track.album.trim().toLowerCase();

          // Check cache first to avoid duplicate API calls for same album
          const cached = releaseCache.get(albumKey);
          if (cached) {
            releaseId = cached.releaseId;
            releaseTitle = cached.releaseTitle;
            releaseCreated = cached.created;
          } else {
            // Find or create the release
            const releaseMetadata: ReleaseMetadata = {
              album: track.album,
              year: track.year,
              date: track.date,
              label: track.label,
              catalogNumber: track.catalogNumber,
              albumArtist: track.albumArtist,
              lossless: track.lossless,
              coverArt: track.coverArt,
            };

            const releaseResult = await findOrCreateReleaseAction(releaseMetadata);

            if (releaseResult.success && releaseResult.releaseId) {
              releaseId = releaseResult.releaseId;
              releaseTitle = releaseResult.releaseTitle;
              releaseCreated = releaseResult.created;

              // Cache the result
              releaseCache.set(albumKey, {
                releaseId: releaseResult.releaseId,
                releaseTitle: releaseResult.releaseTitle || track.album,
                created: releaseResult.created || false,
              });
            }
          }
        }

        // Create the track with optional release association
        const trackData = await prisma.track.create({
          data: {
            title: track.title.trim(),
            duration: track.duration,
            audioUrl: track.audioUrl.trim(),
            position: track.position ?? 0,
            coverArt: track.coverArt?.trim() || undefined,
            // Connect to release if we have one
            ...(releaseId && {
              releaseTracks: {
                create: {
                  releaseId,
                  position: track.position ?? 0,
                  coverArt: track.coverArt?.trim() || undefined,
                },
              },
            }),
          },
        });

        results.push({
          index: i,
          success: true,
          trackId: trackData.id,
          title: track.title,
          releaseId,
          releaseTitle,
          releaseCreated,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create track';

        // Check for duplicate title error
        const isDuplicate =
          errorMessage.toLowerCase().includes('unique') ||
          errorMessage.toLowerCase().includes('duplicate');

        results.push({
          index: i,
          success: false,
          title: track.title,
          error: isDuplicate ? 'A track with this title already exists' : errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    // Log the bulk creation
    logSecurityEvent({
      event: 'media.tracks.bulk_created',
      userId: session.user.id,
      metadata: {
        totalTracks: tracks.length,
        successCount,
        failedCount,
        autoCreateRelease,
        releasesCreated: [...releaseCache.values()].filter((r) => r.created).length,
      },
    });

    revalidatePath('/admin/tracks');

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      results,
    };
  } catch (error) {
    console.error('Bulk track creation error:', error);

    return {
      success: false,
      successCount: 0,
      failedCount: tracks.length,
      results: [],
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
