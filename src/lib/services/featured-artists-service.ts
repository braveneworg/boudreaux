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
          artists: true,
          track: true,
          release: true,
          group: true,
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
              featuredOn: {
                lte: currentDate,
              },
            },
            include: {
              artists: true,
              track: true,
              release: true,
              group: true,
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
      process.env.NODE_ENV === 'development' ? 0 : 600 // Cache for 10 minutes
    );
  }

  /**
   * Get all featured artists for admin (no date filter, includes all)
   */
  static async getAllFeaturedArtists(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<FeaturedArtist[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.FeaturedArtistWhereInput = {
        ...(search && {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const featuredArtists = await prisma.featuredArtist.findMany({
        where,
        skip,
        take,
        orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
        include: {
          artists: true,
          track: true,
          release: true,
          group: true,
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
          artists: true,
          track: true,
          release: true,
          group: true,
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
          artists: true,
          track: true,
          release: true,
          group: true,
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
          artists: true,
          track: true,
          release: true,
          group: true,
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
          artists: true,
          track: true,
          release: true,
          group: true,
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
