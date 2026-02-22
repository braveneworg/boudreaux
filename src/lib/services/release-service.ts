/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';
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
          releaseTracks: {
            include: {
              track: true,
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
          releaseTracks: {
            include: {
              track: true,
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
  }): Promise<ServiceResponse<Release[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.ReleaseWhereInput = {
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { catalogNumber: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
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
   * When a release is published (publishedAt is set), also publishes all associated tracks
   */
  static async updateRelease(
    id: string,
    data: Prisma.ReleaseUpdateInput
  ): Promise<ServiceResponse<Release>> {
    try {
      // Check if we're publishing the release (publishedAt is being set)
      const isPublishing = data.publishedAt !== undefined && data.publishedAt !== null;

      // If publishing, check if the release wasn't already published
      let shouldPublishTracks = false;
      if (isPublishing) {
        const existingRelease = await prisma.release.findUnique({
          where: { id },
          select: { publishedAt: true },
        });

        // Only publish tracks if the release wasn't already published
        shouldPublishTracks = existingRelease !== null && existingRelease.publishedAt === null;
      }

      // Use a transaction to update release and tracks atomically
      const release = await prisma.$transaction(async (tx) => {
        // Update the release
        const updatedRelease = await tx.release.update({
          where: { id },
          data,
          include: {
            images: true,
            artistReleases: {
              include: {
                artist: true,
              },
            },
            releaseTracks: {
              include: {
                track: true,
              },
            },
            releaseUrls: {
              include: {
                url: true,
              },
            },
          },
        });

        // If publishing the release, also publish all associated tracks
        if (shouldPublishTracks && updatedRelease.publishedAt) {
          const trackIds = updatedRelease.releaseTracks.map((rt) => rt.trackId);

          if (trackIds.length > 0) {
            await tx.track.updateMany({
              where: {
                id: { in: trackIds },
                publishedOn: null, // Only update tracks that aren't already published
              },
              data: {
                publishedOn: updatedRelease.publishedAt,
              },
            });
          }
        }

        return updatedRelease;
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
   * Delete a release by ID (hard delete)
   */
  static async deleteRelease(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.delete({
        where: { id },
        include: {
          images: true,
          artistReleases: true,
          releaseTracks: true,
          releaseUrls: true,
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
          releaseTracks: {
            include: {
              track: true,
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
          releaseTracks: {
            include: {
              track: true,
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
   * Includes artist info with groups for display name fallback and search,
   * images for cover art fallback, and URLs for Bandcamp links.
   * Results are cached for 10 minutes in production.
   */
  static async getPublishedReleases(): Promise<ServiceResponse<PublishedReleaseListing[]>> {
    return withCache(
      'published-releases',
      async () => {
        try {
          const releases = await prisma.release.findMany({
            where: {
              publishedAt: { not: null },
              deletedOn: null,
            },
            orderBy: { releasedOn: 'desc' },
            include: {
              images: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
              artistReleases: {
                include: {
                  artist: {
                    include: {
                      groups: {
                        include: {
                          group: true,
                        },
                      },
                    },
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

          return {
            success: true as const,
            data: releases as unknown as PublishedReleaseListing[],
          };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error('Database connection failed:', error);
            return { success: false as const, error: 'Database unavailable' };
          }

          console.error('Unexpected error:', error);
          return { success: false as const, error: 'Failed to fetch published releases' };
        }
      },
      process.env.NODE_ENV === 'development' ? 0 : 600
    );
  }

  /**
   * Get a single published release with full track data for the media player page.
   * Returns `{ success: false }` when the release is not found or not published.
   */
  static async getReleaseWithTracks(id: string): Promise<ServiceResponse<PublishedReleaseDetail>> {
    try {
      const release = await prisma.release.findFirst({
        where: {
          id,
          publishedAt: { not: null },
          deletedOn: null,
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
                  groups: true,
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
          releaseTracks: {
            orderBy: { position: 'asc' },
            include: {
              track: true,
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
          deletedOn: null,
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
