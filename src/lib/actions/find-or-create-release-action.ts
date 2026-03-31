/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import type { Format } from '@/lib/types/media-models';
import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { ArtistService } from '../services/artist-service';
import { ReleaseService } from '../services/release-service';
import { logSecurityEvent } from '../utils/audit-log';

/**
 * Metadata used to find or create a release
 */
export interface ReleaseMetadata {
  /** Album/release title (required) */
  album: string;
  /** Record label */
  label?: string;
  /** Catalog number */
  catalogNumber?: string;
  /** Release year */
  year?: number;
  /** Full release date string */
  date?: string;
  /** Album artist (may differ from track artist) */
  albumArtist?: string;
  /** Track artist from ID3 metadata */
  artist?: string;
  /** Cover art URL (already uploaded) */
  coverArt?: string;
  /** Whether the audio is lossless */
  lossless?: boolean;
  /** Pre-generated MongoDB ObjectId — when provided, the newly created release
   *  uses this value as its `_id` so that S3 keys already referencing it remain valid. */
  id?: string;
}

/**
 * Result of finding or creating a release
 */
export interface FindOrCreateReleaseResult {
  success: boolean;
  /** The release ID if found or created */
  releaseId?: string;
  /** The release title */
  releaseTitle?: string;
  /** Whether the release was newly created (vs found existing) */
  created?: boolean;
  /** The artist ID if found or created from metadata */
  artistId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Determines the format based on metadata
 */
function determineFormat(_lossless?: boolean): Format[] {
  // Default to digital; could be enhanced with more metadata
  // lossless flag could indicate FLAC vs MP3 in the future
  return ['DIGITAL'];
}

/**
 * Parses a release date from various formats
 */
function parseReleaseDate(year?: number, dateStr?: string): Date | undefined {
  // Try full date string first (e.g., "2024-03-15")
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Fall back to year only
  if (year && year > 1900 && year < 2100) {
    // Use January 1st of that year
    return new Date(year, 0, 1);
  }

  return undefined;
}

/**
 * Options for find-or-create release behaviour
 */
export interface FindOrCreateReleaseOptions {
  /** When true the release will be published (publishedAt set) if it is newly
   *  created, or if an existing unpublished release is found. */
  publish?: boolean;
}

/**
 * Best-effort artist find-or-create and release connection from metadata.
 * Prefers `albumArtist` over `artist` (ID3 convention: albumArtist is album-level,
 * artist is per-track). Returns the artist ID if successful, undefined otherwise.
 */
async function connectArtistFromMetadata(
  metadata: ReleaseMetadata,
  releaseId: string
): Promise<string | undefined> {
  const artistName = metadata.albumArtist?.trim() || metadata.artist?.trim();
  if (!artistName) {
    return undefined;
  }

  try {
    const result = await ArtistService.findOrCreateByName(artistName);
    if (result.success) {
      await ArtistService.connectToRelease(result.data.id, releaseId);
      return result.data.id;
    }
  } catch (err) {
    // Artist connection is best-effort — never fail the release creation
    console.warn('[findOrCreateRelease] Could not connect artist from metadata:', err);
  }
  return undefined;
}

/**
 * Find an existing release by title (case-insensitive) or create a new one
 * from audio metadata. This action requires admin role.
 *
 * @param metadata - The metadata extracted from the audio file
 * @param options  - Optional behaviour flags
 * @returns Result indicating success/failure and the release ID
 */
export async function findOrCreateReleaseAction(
  metadata: ReleaseMetadata,
  options: FindOrCreateReleaseOptions = {}
): Promise<FindOrCreateReleaseResult> {
  await requireRole('admin');

  // Validate required field
  if (!metadata.album || metadata.album.trim() === '') {
    return {
      success: false,
      error: 'Album name is required to find or create a release',
    };
  }

  const albumTitle = metadata.album.trim();

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return {
        success: false,
        error: 'You must be a logged in admin user to manage releases',
      };
    }

    // Try to find an existing release by title (case-insensitive)
    const existingRelease = await prisma.release.findFirst({
      where: {
        title: {
          equals: albumTitle,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        deletedOn: true,
      },
    });

    if (existingRelease) {
      // Build update payload: un-delete soft-deleted releases and publish if requested
      const updateData: { deletedOn?: null; publishedAt?: Date } = {};

      if (existingRelease.deletedOn) {
        updateData.deletedOn = null;
      }

      if (options.publish && !existingRelease.publishedAt) {
        updateData.publishedAt = new Date();
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.release.update({
          where: { id: existingRelease.id },
          data: updateData,
        });

        revalidatePath('/admin/releases');
      }

      logSecurityEvent({
        event: 'media.release.found',
        userId: session.user.id,
        metadata: {
          releaseId: existingRelease.id,
          releaseTitle: existingRelease.title,
          searchedTitle: albumTitle,
        },
      });

      // Connect artist from metadata (best-effort)
      const foundArtistId = await connectArtistFromMetadata(metadata, existingRelease.id);

      return {
        success: true,
        releaseId: existingRelease.id,
        releaseTitle: existingRelease.title,
        created: false,
        artistId: foundArtistId,
      };
    }

    // No existing release found - create a new one
    const releasedOn = parseReleaseDate(metadata.year, metadata.date) ?? new Date();
    const formats = determineFormat(metadata.lossless);
    const labels = metadata.label ? [metadata.label.trim()] : [];

    const createResponse = await ReleaseService.createRelease({
      ...(metadata.id ? { id: metadata.id } : {}),
      title: albumTitle,
      releasedOn,
      formats,
      labels,
      catalogNumber: metadata.catalogNumber?.trim() || undefined,
      coverArt: metadata.coverArt || '',
      ...(options.publish ? { publishedAt: new Date() } : {}),
    });

    if (!createResponse.success) {
      logSecurityEvent({
        event: 'media.release.create_failed',
        userId: session.user.id,
        metadata: {
          attemptedTitle: albumTitle,
          error: createResponse.error,
        },
      });

      return {
        success: false,
        error: createResponse.error || 'Failed to create release',
      };
    }

    logSecurityEvent({
      event: 'media.release.created',
      userId: session.user.id,
      metadata: {
        releaseId: createResponse.data.id,
        releaseTitle: createResponse.data.title,
        fromMetadata: true,
        metadataFields: Object.keys(metadata).filter(
          (key) => metadata[key as keyof ReleaseMetadata] !== undefined
        ),
      },
    });

    revalidatePath('/admin/releases');

    // Connect artist from metadata (best-effort)
    const createdArtistId = await connectArtistFromMetadata(metadata, createResponse.data.id);

    return {
      success: true,
      releaseId: createResponse.data.id,
      releaseTitle: createResponse.data.title,
      created: true,
      artistId: createdArtistId,
    };
  } catch (error) {
    console.error('Error in findOrCreateReleaseAction:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
