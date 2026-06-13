/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { withCache } from '@/lib/utils/simple-cache';

import type { ServiceResponse } from './service.types';

export class FeaturedArtistsService {
  static async createFeaturedArtist(
    data: Prisma.FeaturedArtistCreateInput
  ): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const artist = await prisma.featuredArtist.create({
        data,
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });
      return { success: true, data: artist };
    } catch (error) {
      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create artist' };
    }
  }

  static async getFeaturedArtists(
    currentDate: Date,
    limit = 10
  ): Promise<ServiceResponse<FeaturedArtist[]>> {
    // Create a cache key based on date and limit
    const cacheKey = `featured-artists:${currentDate.toISOString().split('T')[0]}:${limit}`;

    return withCache(
      cacheKey,
      async () => {
        try {
          const artists = await prisma.featuredArtist.findMany({
            where: {
              publishedOn: { not: null },
              featuredOn: {
                lte: currentDate,
              },
              OR: [
                { featuredUntil: null },
                { featuredUntil: { isSet: false } },
                { featuredUntil: { gte: currentDate } },
              ],
            },
            include: {
              artists: {
                include: {
                  images: true,
                },
              },
              digitalFormat: {
                include: {
                  files: {
                    orderBy: { trackNumber: 'asc' as const },
                  },
                },
              },
              release: {
                include: {
                  images: true,
                  artistReleases: {
                    include: {
                      artist: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              featuredOn: 'desc',
            },
            take: limit,
          });

          return { success: true as const, data: artists };
        } catch (error) {
          // Connection/network issues
          if (error instanceof Prisma.PrismaClientInitializationError) {
            console.error('Database connection failed:', error);
            return { success: false as const, error: 'Database unavailable' };
          }

          // Unknown errors
          console.error('Unexpected error:', error);
          return { success: false as const, error: 'Failed to fetch artists' };
        }
      },
      process.env.NODE_ENV === 'development' || process.env.E2E_MODE === 'true' ? 0 : 600 // Cache for 10 minutes; disabled in E2E to avoid stale data from webServer health check
    );
  }

  /**
   * Get all featured artists for admin (no date filter, includes all).
   *
   * Supports server-side `search` plus a `published` filter. The
   * FeaturedArtist model has no `deletedOn` field, so the `deleted` param is
   * accepted for a uniform admin API but applies no soft-delete constraint.
   * The search OR and the published OR are combined under `AND` so the two
   * `OR` keys never collide (Prisma 6 + MongoDB null-safe pattern).
   *
   * - `published === true` → only featured artists with a `publishedOn` date.
   * - `published === false` → only featured artists without a `publishedOn` date.
   * - `published == null` → no publish filter.
   */
  static async getAllFeaturedArtists(params?: {
    skip?: number;
    take?: number;
    search?: string;
    published?: boolean;
    deleted?: boolean;
  }): Promise<ServiceResponse<FeaturedArtist[]>> {
    try {
      const { skip = 0, take = 50, search, published } = params || {};

      const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });
      const and: Prisma.FeaturedArtistWhereInput[] = [];

      if (published === true) {
        and.push({ publishedOn: { not: null } });
      } else if (published === false) {
        and.push({ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] });
      }
      if (search) {
        and.push({
          OR: [{ displayName: contains(search) }, { description: contains(search) }],
        });
      }

      const where: Prisma.FeaturedArtistWhereInput = and.length > 0 ? { AND: and } : {};

      const featuredArtists = await prisma.featuredArtist.findMany({
        where,
        skip,
        take,
        orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: featuredArtists };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve featured artists' };
    }
  }

  /**
   * Get a featured artist by ID
   */
  static async getFeaturedArtistById(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await prisma.featuredArtist.findUnique({
        where: { id },
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });

      if (!featuredArtist) {
        return { success: false, error: 'Featured artist not found' };
      }

      return { success: true, data: featuredArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve featured artist' };
    }
  }

  /**
   * Update a featured artist by ID
   */
  static async updateFeaturedArtist(
    id: string,
    data: Prisma.FeaturedArtistUpdateInput
  ): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await prisma.featuredArtist.update({
        where: { id },
        data,
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: featuredArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Featured artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update featured artist' };
    }
  }

  /**
   * Delete a featured artist by ID (soft delete by setting deletedOn)
   */
  static async deleteFeaturedArtist(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await prisma.featuredArtist.update({
        where: { id },
        data: {
          // Note: FeaturedArtist model doesn't have deletedOn, so we do a hard delete
        },
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: featuredArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Featured artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete featured artist' };
    }
  }

  /**
   * Hard delete a featured artist by ID
   */
  static async hardDeleteFeaturedArtist(id: string): Promise<ServiceResponse<FeaturedArtist>> {
    try {
      const featuredArtist = await prisma.featuredArtist.delete({
        where: { id },
        include: {
          artists: {
            include: {
              images: true,
            },
          },
          digitalFormat: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' as const },
              },
            },
          },
          release: {
            include: {
              images: true,
              artistReleases: {
                include: {
                  artist: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: featuredArtist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Featured artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete featured artist' };
    }
  }
}
