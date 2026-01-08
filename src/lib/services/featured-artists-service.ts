import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { withCache } from '@/lib/utils/simple-cache';
import type { FeaturedArtist } from '@/lib/types/media-models';

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
}
