/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';
import { deleteS3Object } from '../utils/s3-client';
import { withCache } from '../utils/simple-cache';

import type { ServiceResponse } from './service.types';
import type {
  PublishedReleaseDetail,
  PublishedReleaseListing,
  Release,
  ReleaseCarouselItem,
} from '../types/media-models';

export class ReleaseService {
  /**
   * Create a new release
   */
  static async createRelease(data: Prisma.ReleaseCreateInput): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.create({
        data,
        include: {
          artistReleases: {
            include: {
              artist: true,
            },
          },
          digitalFormats: {
            include: {
              files: true,
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
          images: true,
        },
      });
      return { success: true, data: release as unknown as Release };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Release with this title already exists' };
      }

      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create release' };
    }
  }

  /**
   * Get a release by ID
   */
  static async getReleaseById(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.findUnique({
        where: { id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          artistReleases: {
            include: {
              artist: true,
            },
          },
          digitalFormats: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' },
              },
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
        },
      });

      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      return { success: true, data: release as unknown as Release };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve release' };
    }
  }

  /**
   * Get all releases with optional filters
   */
  static async getReleases(params?: {
    skip?: number;
    take?: number;
    search?: string;
    artistIds?: string[];
  }): Promise<ServiceResponse<Release[]>> {
    try {
      const { skip = 0, take = 50, search, artistIds } = params || {};

      const where: Prisma.ReleaseWhereInput = {
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { catalogNumber: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(artistIds &&
          artistIds.length > 0 && {
            artistReleases: {
              some: {
                artistId: { in: artistIds },
              },
            },
          }),
      };

      const releases = await prisma.release.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistReleases: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: releases as unknown as Release[] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve releases' };
    }
  }

  /**
   * Update a release by ID
   */
  static async updateRelease(
    id: string,
    data: Prisma.ReleaseUpdateInput
  ): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.update({
        where: { id },
        data,
        include: {
          images: true,
          artistReleases: {
            include: {
              artist: true,
            },
          },
          digitalFormats: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' },
              },
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
        },
      });

      return { success: true, data: release as unknown as Release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Release with this title already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update release' };
    }
  }

  /**
   * Delete a release by ID (hard delete).
   * Cascades to delete all related data EXCEPT Artist records.
   * Deletes S3 objects for digital format files and images.
   */
  static async deleteRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      // Verify release exists and fetch related data for S3 cleanup
      const existing = await prisma.release.findUnique({
        where: { id },
        include: {
          digitalFormats: {
            include: { files: true },
          },
          images: true,
        },
      });

      if (!existing) {
        return { success: false, error: 'Release not found' };
      }

      // Collect S3 keys for cleanup
      const s3KeysToDelete: string[] = [];
      for (const format of existing.digitalFormats) {
        for (const file of format.files) {
          if (file.s3Key) s3KeysToDelete.push(file.s3Key);
        }
      }

      // Delete related records in dependency order (children first)
      // 1. Digital format files (child of ReleaseDigitalFormat)
      for (const format of existing.digitalFormats) {
        await prisma.releaseDigitalFormatFile.deleteMany({
          where: { formatId: format.id },
        });
      }

      // 2. Digital formats
      await prisma.releaseDigitalFormat.deleteMany({ where: { releaseId: id } });

      // 3. Purchase and download records
      await prisma.releasePurchase.deleteMany({ where: { releaseId: id } });
      await prisma.releaseDownload.deleteMany({ where: { releaseId: id } });

      // 4. Download events (no FK relation, just matching field)
      await prisma.downloadEvent.deleteMany({ where: { releaseId: id } });

      // 5. Release URLs (junction table)
      await prisma.releaseUrl.deleteMany({ where: { releaseId: id } });

      // 6. Images (shared model — only delete images linked to this release)
      await prisma.image.deleteMany({ where: { releaseId: id } });

      // 7. ArtistRelease junction records (does NOT delete the Artist)
      await prisma.artistRelease.deleteMany({ where: { releaseId: id } });

      // 8. FeaturedArtist references (disconnect, don't delete the featured artist record)
      await prisma.featuredArtist.updateMany({
        where: { releaseId: id },
        data: { releaseId: null },
      });

      // 9. Delete the release itself
      const release = await prisma.release.delete({
        where: { id },
      });

      // 10. Best-effort S3 cleanup (async, fire-and-forget)
      Promise.allSettled(s3KeysToDelete.map((key) => deleteS3Object(key))).catch(() => {
        // Silently ignore — S3 objects will be cleaned up by lifecycle rules
      });

      return { success: true, data: release as unknown as Release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete release' };
    }
  }

  /**
   * Soft delete a release by ID (set deletedOn timestamp)
   */
  static async softDeleteRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.update({
        where: { id },
        data: { deletedOn: new Date() },
        include: {
          images: true,
          artistReleases: {
            include: {
              artist: true,
            },
          },
          digitalFormats: {
            include: {
              files: true,
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
        },
      });

      return { success: true, data: release as unknown as Release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to soft delete release' };
    }
  }

  /**
   * Restore a soft-deleted release by ID (clear deletedOn timestamp)
   */
  static async restoreRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.update({
        where: { id },
        data: { deletedOn: null },
        include: {
          images: true,
          artistReleases: {
            include: {
              artist: true,
            },
          },
          digitalFormats: {
            include: {
              files: true,
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
        },
      });

      return { success: true, data: release as unknown as Release };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Release not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to restore release' };
    }
  }

  // ===========================================================================
  // Public release methods (for /releases pages)
  // ===========================================================================

  /**
   * Get all published releases for the public listing page.
   * Includes artist info for display name and search,
   * images for cover art fallback, and URLs for Bandcamp links.
   * Results are cached for 10 minutes in production.
   */
  static async getPublishedReleases(): Promise<ServiceResponse<PublishedReleaseListing[]>> {
    const fetchReleases = async (): Promise<ServiceResponse<PublishedReleaseListing[]>> => {
      try {
        const releases = await prisma.release.findMany({
          where: {
            publishedAt: { not: null },
            // Prisma 6 + MongoDB: `deletedOn: null` only matches fields explicitly
            // set to null, not missing fields. Use OR to handle both cases.
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
          },
          orderBy: { releasedOn: 'desc' },
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
            artistReleases: {
              include: {
                artist: true,
              },
            },
            releaseUrls: {
              include: {
                url: true,
              },
            },
          },
        });

        return {
          success: true,
          data: releases as unknown as PublishedReleaseListing[],
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientInitializationError) {
          console.error('Database connection failed:', error);
          return { success: false, error: 'Database unavailable' };
        }

        console.error('Unexpected error:', error);
        return { success: false, error: 'Failed to fetch published releases' };
      }
    };

    if (process.env.NODE_ENV === 'development') {
      return fetchReleases();
    }

    return withCache('published-releases', fetchReleases, 600);
  }

  /**
   * Get a single published release with digital format files for the media player page.
   * Returns MP3_320KBPS files sorted by track number for audio playback.
   * Returns `{ success: false }` when the release is not found or not published.
   */
  static async getReleaseWithTracks(id: string): Promise<ServiceResponse<PublishedReleaseDetail>> {
    try {
      const release = await prisma.release.findFirst({
        where: {
          id,
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          artistReleases: {
            include: {
              artist: {
                include: {
                  images: true,
                  labels: true,
                  releases: {
                    include: {
                      release: true,
                    },
                  },
                  urls: true,
                },
              },
            },
          },
          digitalFormats: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' },
              },
            },
          },
          releaseUrls: {
            include: {
              url: true,
            },
          },
        },
      });

      if (!release) {
        return { success: false, error: 'Release not found' };
      }

      return { success: true, data: release as unknown as PublishedReleaseDetail };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve release' };
    }
  }

  /**
   * Get other published releases by an artist, excluding the current release.
   * Used for the "more by this artist" carousel on the media player page.
   */
  static async getArtistOtherReleases(
    artistId: string,
    excludeReleaseId: string
  ): Promise<ServiceResponse<ReleaseCarouselItem[]>> {
    try {
      const releases = await prisma.release.findMany({
        where: {
          artistReleases: { some: { artistId } },
          id: { not: excludeReleaseId },
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { releasedOn: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
      });

      return { success: true, data: releases as unknown as ReleaseCarouselItem[] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to fetch artist releases' };
    }
  }
}
