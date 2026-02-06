'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { findOrCreateArtistAction } from './find-or-create-artist-action';
import { findOrCreateGroupAction } from './find-or-create-group-action';
import { findOrCreateReleaseAction, type ReleaseMetadata } from './find-or-create-release-action';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

import type { Prisma } from '@prisma/client';

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
  /** Track artist from metadata */
  artist?: string;
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
 * @param publishTracks - Whether to publish the tracks immediately
 * @returns Result with details for each track
 */
export async function bulkCreateTracksAction(
  tracks: BulkTrackData[],
  autoCreateRelease = true,
  publishTracks = false
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
    const artistCache = new Map<
      string,
      { artistId: string; artistName: string; created: boolean }
    >();
    const groupCache = new Map<string, { groupId: string; groupName: string; created: boolean }>();

    // First pass: Find or create all releases (outside transaction since they're
    // shared resources that shouldn't be rolled back if individual tracks fail)
    // Also link albumArtist to the release if present
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
            const releaseId = releaseResult.releaseId;

            // If albumArtist is present, find/create them and link to the release
            // This represents the "main" artist on the album (e.g., the band name)
            if (track.albumArtist?.trim()) {
              const albumArtistName = track.albumArtist.trim();
              const albumArtistKey = albumArtistName.toLowerCase();

              // Check if we've already processed this album artist
              if (!artistCache.has(albumArtistKey)) {
                const albumArtistResult = await findOrCreateArtistAction(albumArtistName, {
                  releaseId,
                });

                if (albumArtistResult.success && albumArtistResult.artistId) {
                  artistCache.set(albumArtistKey, {
                    artistId: albumArtistResult.artistId,
                    artistName: albumArtistResult.artistName || albumArtistName,
                    created: albumArtistResult.created || false,
                  });
                }
              } else {
                // Artist already exists, just create the ArtistRelease if needed
                const cachedAlbumArtist = artistCache.get(albumArtistKey)!;
                const existingArtistRelease = await prisma.artistRelease.findUnique({
                  where: {
                    artistId_releaseId: {
                      artistId: cachedAlbumArtist.artistId,
                      releaseId,
                    },
                  },
                });

                if (!existingArtistRelease) {
                  await prisma.artistRelease.create({
                    data: {
                      artistId: cachedAlbumArtist.artistId,
                      releaseId,
                    },
                  });
                }
              }
            }

            releaseCache.set(albumKey, {
              releaseId,
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

        // Get artist name (priority: track artist > album artist)
        const artistName = track.artist?.trim() || track.albumArtist?.trim();

        // Determine if albumArtist represents a group (when it differs from artist)
        // Common pattern: artist is the band member, albumArtist is the band name
        const trimmedArtist = track.artist?.trim();
        const trimmedAlbumArtist = track.albumArtist?.trim();
        const groupName =
          trimmedAlbumArtist &&
          trimmedArtist &&
          trimmedAlbumArtist.toLowerCase() !== trimmedArtist.toLowerCase()
            ? trimmedAlbumArtist
            : undefined;

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

          // Handle group creation/association if albumArtist differs from artist
          let groupId: string | undefined;

          if (groupName && artistId) {
            const groupKey = groupName.toLowerCase();
            const cachedGroup = groupCache.get(groupKey);

            if (cachedGroup) {
              groupId = cachedGroup.groupId;

              // Still need to create ArtistGroup association for cached groups
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
          const trackData = await tx.track.create({
            data: {
              title: track.title.trim(),
              duration: track.duration,
              audioUrl: track.audioUrl.trim(),
              position: track.position ?? 0,
              coverArt: track.coverArt?.trim() || undefined,
              publishedOn: publishTracks ? new Date() : undefined,
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
