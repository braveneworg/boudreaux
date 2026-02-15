/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';

import { findOrCreateArtistAction } from './find-or-create-artist-action';
import { findOrCreateGroupAction } from './find-or-create-group-action';
import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';

import type { Prisma } from '@prisma/client';

const logger = loggers.media;

/**
 * Data for a single track in a bulk upload
 */
export interface BulkTrackData {
  /** Track title */
  title: string;
  /** Duration in seconds */
  duration: number;
  /** S3 URL of the uploaded audio file (optional when deferUpload is true) */
  audioUrl?: string;
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
  /** Track artist from metadata */
  artist?: string;
  /** Whether the audio is lossless */
  lossless?: boolean;
  /** SHA-256 hash of the audio file for duplicate detection */
  audioFileHash?: string;
}

/**
 * Options for bulk track creation
 */
export interface BulkCreateTracksOptions {
  /** Whether to auto-create releases from album metadata (default: true) */
  autoCreateRelease?: boolean;
  /** Whether to publish tracks immediately (default: false) */
  publishTracks?: boolean;
  /** Whether to defer audio upload - tracks created with PENDING status (default: false) */
  deferUpload?: boolean;
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
 * @param options - Configuration options for bulk creation
 * @returns Result with details for each track
 */
export async function bulkCreateTracksAction(
  tracks: BulkTrackData[],
  options: BulkCreateTracksOptions = {}
): Promise<BulkCreateTracksResult> {
  const { autoCreateRelease = true, publishTracks = false, deferUpload = false } = options;
  const session = await requireRole('admin');

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
    const results: BulkTrackResult[] = [];
    const releaseCache = new Map<
      string,
      { releaseId: string; releaseTitle: string; created: boolean }
    >();
    const artistCache = new Map<
      string,
      { artistId: string; artistName: string; created: boolean }
    >();
    const groupCache = new Map<string, { groupId: string; groupName: string; created: boolean }>();

    // First pass: Find or create all releases (outside transaction since they're
    // shared resources that shouldn't be rolled back if individual tracks fail)
    // Also pre-create Groups from albumArtist metadata if present
    for (const track of tracks) {
      if (autoCreateRelease && track.album && track.album.trim() !== '') {
        const albumKey = track.album.trim().toLowerCase();

        if (!releaseCache.has(albumKey)) {
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
            // If albumArtist is present, find/create a Group (not an Artist)
            // The albumArtist represents the group/band name on the album
            if (track.albumArtist?.trim()) {
              const albumArtistName = track.albumArtist.trim();
              const groupKey = albumArtistName.toLowerCase();

              if (!groupCache.has(groupKey)) {
                const groupResult = await findOrCreateGroupAction(albumArtistName);

                if (groupResult.success && groupResult.groupId) {
                  groupCache.set(groupKey, {
                    groupId: groupResult.groupId,
                    groupName: groupResult.groupName || albumArtistName,
                    created: groupResult.created || false,
                  });
                }
              }
            }

            releaseCache.set(albumKey, {
              releaseId: releaseResult.releaseId,
              releaseTitle: releaseResult.releaseTitle || track.album,
              created: releaseResult.created || false,
            });
          }
        }
      }
    }

    // Process each track in a transaction
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

      // audioUrl is only required when not deferring upload
      if (!deferUpload && (!track.audioUrl || track.audioUrl.trim() === '')) {
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
        // Get release info from cache
        let releaseId: string | undefined;
        let releaseTitle: string | undefined;
        let releaseCreated: boolean | undefined;

        if (autoCreateRelease && track.album && track.album.trim() !== '') {
          const albumKey = track.album.trim().toLowerCase();
          const cached = releaseCache.get(albumKey);
          if (cached) {
            releaseId = cached.releaseId;
            releaseTitle = cached.releaseTitle;
            releaseCreated = cached.created;
          }
        }

        const trimmedArtist = track.artist?.trim() || undefined;
        const trimmedAlbumArtist = track.albumArtist?.trim() || undefined;

        // albumArtist always creates a Group (the band/ensemble).
        // An individual Artist is only created when:
        //   - artist differs from albumArtist (individual member on this track)
        //   - OR no albumArtist exists (legacy behavior: artist field creates an Artist)
        const hasAlbumArtist = !!trimmedAlbumArtist;
        const hasDistinctArtist =
          !!trimmedArtist &&
          hasAlbumArtist &&
          trimmedArtist.toLowerCase() !== trimmedAlbumArtist!.toLowerCase();

        const artistName = hasAlbumArtist
          ? hasDistinctArtist
            ? trimmedArtist
            : undefined
          : trimmedArtist;

        const groupName = hasAlbumArtist ? trimmedAlbumArtist : undefined;

        // Create track and all associations in a single transaction
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          // Handle artist creation/association with transaction client
          let artistId: string | undefined;

          if (artistName) {
            const artistKey = artistName.toLowerCase();
            const cachedArtist = artistCache.get(artistKey);

            if (cachedArtist) {
              artistId = cachedArtist.artistId;

              // Still need to create associations for cached artists
              if (releaseId) {
                // Check if ArtistRelease exists
                const existingArtistRelease = await tx.artistRelease.findUnique({
                  where: {
                    artistId_releaseId: {
                      artistId,
                      releaseId,
                    },
                  },
                });

                if (!existingArtistRelease) {
                  await tx.artistRelease.create({
                    data: {
                      artistId,
                      releaseId,
                    },
                  });
                }
              }
            } else {
              // Find or create artist with associations in transaction
              const artistResult = await findOrCreateArtistAction(artistName, {
                releaseId,
                tx,
              });

              if (artistResult.success && artistResult.artistId) {
                artistId = artistResult.artistId;
                artistCache.set(artistKey, {
                  artistId: artistResult.artistId,
                  artistName: artistResult.artistName || artistName,
                  created: artistResult.created || false,
                });
              }
            }
          }

          // Handle group creation/association from albumArtist
          // Groups are created even without an individual artist
          let groupId: string | undefined;

          if (groupName) {
            const groupKey = groupName.toLowerCase();
            const cachedGroup = groupCache.get(groupKey);

            if (cachedGroup) {
              groupId = cachedGroup.groupId;

              // Create ArtistGroup association if we have an individual artist
              if (artistId) {
                const existingArtistGroup = await tx.artistGroup.findUnique({
                  where: {
                    artistId_groupId: {
                      artistId,
                      groupId,
                    },
                  },
                });

                if (!existingArtistGroup) {
                  await tx.artistGroup.create({
                    data: {
                      artistId,
                      groupId,
                    },
                  });
                }
              }
            } else {
              // Find or create group with artist association in transaction
              const groupResult = await findOrCreateGroupAction(groupName, {
                artistId,
                tx,
              });

              if (groupResult.success && groupResult.groupId) {
                groupId = groupResult.groupId;
                groupCache.set(groupKey, {
                  groupId: groupResult.groupId,
                  groupName: groupResult.groupName || groupName,
                  created: groupResult.created || false,
                });
              }
            }
          }

          // Create the track with optional release and artist associations
          // When deferUpload is true, use placeholder URL and PENDING status
          const audioUrl = deferUpload
            ? track.audioUrl?.trim() || 'pending://upload'
            : track.audioUrl?.trim();

          if (!audioUrl && !deferUpload) {
            throw new Error('audioUrl is required when deferUpload is false');
          }

          const trackData = await tx.track.create({
            data: {
              title: track.title.trim(),
              duration: track.duration,
              audioUrl: audioUrl || 'pending://upload',
              position: track.position ?? 0,
              coverArt: track.coverArt?.trim() || undefined,
              audioFileHash: track.audioFileHash || undefined,
              publishedOn: publishTracks ? new Date() : undefined,
              audioUploadStatus: deferUpload ? 'PENDING' : 'COMPLETED',
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
              // Connect to artist if we have one
              ...(artistId && {
                artists: {
                  create: {
                    artistId,
                  },
                },
              }),
            },
          });

          return { trackData, artistId, groupId };
        });

        results.push({
          index: i,
          success: true,
          trackId: result.trackData.id,
          title: track.title,
          releaseId,
          releaseTitle,
          releaseCreated,
        });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '';

        // Check for duplicate title error
        const isDuplicate =
          rawMessage.toLowerCase().includes('unique') ||
          rawMessage.toLowerCase().includes('duplicate');

        results.push({
          index: i,
          success: false,
          title: track.title,
          error: isDuplicate ? 'A track with this title already exists' : 'Failed to create track',
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
        deferUpload,
        releasesCreated: [...releaseCache.values()].filter((r) => r.created).length,
        artistsCreated: [...artistCache.values()].filter((a) => a.created).length,
        groupsCreated: [...groupCache.values()].filter((g) => g.created).length,
        artistReleasesCreated: artistCache.size > 0 && releaseCache.size > 0,
        artistGroupsCreated: artistCache.size > 0 && groupCache.size > 0,
      },
    });

    revalidatePath('/admin/tracks');
    revalidatePath('/admin/artists');
    revalidatePath('/admin/releases');
    revalidatePath('/admin/groups');

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      results,
    };
  } catch (error) {
    logger.error('Bulk track creation error', error);

    return {
      success: false,
      successCount: 0,
      failedCount: tracks.length,
      results: [],
      error: 'An unexpected error occurred',
    };
  }
}
