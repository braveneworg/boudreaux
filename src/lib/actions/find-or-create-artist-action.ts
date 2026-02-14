'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

import type { Prisma } from '@prisma/client';

/**
 * Result of finding or creating an artist
 */
export interface FindOrCreateArtistResult {
  success: boolean;
  /** The artist ID if found or created */
  artistId?: string;
  /** The artist display name */
  artistName?: string;
  /** Whether the artist was newly created (vs found existing) */
  created?: boolean;
  /** Whether an ArtistRelease was created */
  artistReleaseCreated?: boolean;
  /** Whether a TrackArtist was created */
  trackArtistCreated?: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Options for finding or creating an artist
 */
export interface FindOrCreateArtistOptions {
  /** Release ID to associate with this artist (creates ArtistRelease) */
  releaseId?: string;
  /** Track ID to associate with this artist (creates TrackArtist) */
  trackId?: string;
  /** Prisma transaction client (for wrapping in a larger transaction) */
  tx?: Prisma.TransactionClient;
}

/**
 * Generates a URL-friendly slug from an artist name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Parses an artist name into first name and surname
 * Handles common patterns like "First Last", "First Middle Last", etc.
 */
function parseArtistName(name: string): {
  firstName: string;
  surname: string;
  displayName: string;
} {
  const trimmedName = name.trim();
  const parts = trimmedName.split(/\s+/);

  if (parts.length === 1) {
    // Single name - use as both first and surname (like "Madonna", "Prince")
    return {
      firstName: parts[0],
      surname: parts[0],
      displayName: trimmedName,
    };
  }

  // Multiple parts - first word is first name, rest is surname
  const firstName = parts[0];
  const surname = parts.slice(1).join(' ');

  return {
    firstName,
    surname,
    displayName: trimmedName,
  };
}

/**
 * Find an existing artist by name (case-insensitive) or create a new one.
 * Optionally creates ArtistRelease and TrackArtist associations.
 * This action requires admin role.
 *
 * @param artistName - The artist name from audio metadata
 * @param options - Optional settings for release/track associations and transaction
 * @returns Result indicating success/failure and the artist ID
 */
export async function findOrCreateArtistAction(
  artistName: string,
  options: FindOrCreateArtistOptions = {}
): Promise<FindOrCreateArtistResult> {
  const session = await requireRole('admin');

  // Validate required field
  if (!artistName || artistName.trim() === '') {
    return {
      success: false,
      error: 'Artist name is required',
    };
  }

  const name = artistName.trim();
  const { releaseId, trackId, tx } = options;
  // Use provided transaction client or default prisma client
  const db = tx || prisma;

  try {
    // Try to find an existing artist by display name (case-insensitive)
    const existingArtist = await db.artist.findFirst({
      where: {
        OR: [
          {
            displayName: {
              equals: name,
              mode: 'insensitive',
            },
          },
          // Also check combined first + surname for artists without displayName
          {
            AND: [
              { firstName: { equals: name.split(' ')[0], mode: 'insensitive' } },
              {
                surname: {
                  equals: name.split(' ').slice(1).join(' ') || name.split(' ')[0],
                  mode: 'insensitive',
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        surname: true,
      },
    });

    if (existingArtist) {
      const displayName =
        existingArtist.displayName ||
        `${existingArtist.firstName} ${existingArtist.surname}`.trim();

      // Create associations for existing artist
      let artistReleaseCreated = false;
      let trackArtistCreated = false;

      // Create ArtistRelease if releaseId provided and doesn't exist
      if (releaseId) {
        const existingArtistRelease = await db.artistRelease.findUnique({
          where: {
            artistId_releaseId: {
              artistId: existingArtist.id,
              releaseId,
            },
          },
        });

        if (!existingArtistRelease) {
          await db.artistRelease.create({
            data: {
              artistId: existingArtist.id,
              releaseId,
            },
          });
          artistReleaseCreated = true;
        }
      }

      // Create TrackArtist if trackId provided and doesn't exist
      if (trackId) {
        const existingTrackArtist = await db.trackArtist.findUnique({
          where: {
            trackId_artistId: {
              trackId,
              artistId: existingArtist.id,
            },
          },
        });

        if (!existingTrackArtist) {
          await db.trackArtist.create({
            data: {
              trackId,
              artistId: existingArtist.id,
            },
          });
          trackArtistCreated = true;
        }
      }

      logSecurityEvent({
        event: 'media.artist.found',
        userId: session.user.id,
        metadata: {
          artistId: existingArtist.id,
          artistName: displayName,
          searchedName: name,
          artistReleaseCreated,
          trackArtistCreated,
        },
      });

      return {
        success: true,
        artistId: existingArtist.id,
        artistName: displayName,
        created: false,
        artistReleaseCreated,
        trackArtistCreated,
      };
    }

    // No existing artist found - create a new one
    const { firstName, surname, displayName } = parseArtistName(name);
    const baseSlug = generateSlug(name);

    // Ensure unique slug by checking if it exists (capped at 100 iterations)
    let slug = baseSlug;
    let slugSuffix = 1;
    const MAX_SLUG_ATTEMPTS = 100;

    while (slugSuffix <= MAX_SLUG_ATTEMPTS) {
      const existingSlug = await db.artist.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existingSlug) {
        break;
      }

      slug = `${baseSlug}-${slugSuffix}`;
      slugSuffix++;

      if (slugSuffix > MAX_SLUG_ATTEMPTS) {
        throw new Error(
          `Could not generate unique slug for artist "${name}" after ${MAX_SLUG_ATTEMPTS} attempts`
        );
      }
    }

    // Build artist creation data with optional associations
    const artistData: Parameters<typeof db.artist.create>[0]['data'] = {
      firstName,
      surname,
      displayName,
      slug,
      isActive: true,
      createdBy: session.user.id,
    };

    // Create artist with optional ArtistRelease and TrackArtist in one go
    const newArtist = await db.artist.create({
      data: {
        ...artistData,
        // Create ArtistRelease if releaseId provided
        ...(releaseId && {
          releases: {
            create: {
              releaseId,
            },
          },
        }),
        // Create TrackArtist if trackId provided
        ...(trackId && {
          trackArtists: {
            create: {
              trackId,
            },
          },
        }),
      },
    });

    logSecurityEvent({
      event: 'media.artist.created',
      userId: session.user.id,
      metadata: {
        artistId: newArtist.id,
        artistName: displayName,
        slug,
        source: 'bulk-upload',
        artistReleaseCreated: !!releaseId,
        trackArtistCreated: !!trackId,
      },
    });

    // Only revalidate if not in a transaction (transaction will handle revalidation)
    if (!tx) {
      revalidatePath('/admin/artists');
    }

    return {
      success: true,
      artistId: newArtist.id,
      artistName: displayName,
      created: true,
      artistReleaseCreated: !!releaseId,
      trackArtistCreated: !!trackId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to find or create artist';

    console.error('Find or create artist error:', error);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
