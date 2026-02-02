'use server';

import { revalidatePath } from 'next/cache';

import type { Format } from '@/lib/types/media-models';
import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
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
  /** Cover art URL (already uploaded) */
  coverArt?: string;
  /** Whether the audio is lossless */
  lossless?: boolean;
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
 * Find an existing release by title (case-insensitive) or create a new one
 * from audio metadata. This action requires admin role.
 *
 * @param metadata - The metadata extracted from the audio file
 * @returns Result indicating success/failure and the release ID
 */
export async function findOrCreateReleaseAction(
  metadata: ReleaseMetadata
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
      },
    });

    if (existingRelease) {
      logSecurityEvent({
        event: 'media.release.found',
        userId: session.user.id,
        metadata: {
          releaseId: existingRelease.id,
          releaseTitle: existingRelease.title,
          searchedTitle: albumTitle,
        },
      });

      return {
        success: true,
        releaseId: existingRelease.id,
        releaseTitle: existingRelease.title,
        created: false,
      };
    }

    // No existing release found - create a new one
    const releasedOn = parseReleaseDate(metadata.year, metadata.date) ?? new Date();
    const formats = determineFormat(metadata.lossless);
    const labels = metadata.label ? [metadata.label.trim()] : [];

    const createResponse = await ReleaseService.createRelease({
      title: albumTitle,
      releasedOn,
      formats,
      labels,
      catalogNumber: metadata.catalogNumber?.trim() || undefined,
      coverArt: metadata.coverArt || '',
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

    return {
      success: true,
      releaseId: createResponse.data.id,
      releaseTitle: createResponse.data.title,
      created: true,
    };
  } catch (error) {
    console.error('Error in findOrCreateReleaseAction:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}
