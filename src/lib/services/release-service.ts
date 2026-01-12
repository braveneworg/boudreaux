import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

import type { ServiceResponse } from './service.types';
import type { Release } from '../types/media-models';

export class ReleaseService {
  // Release service methods would go here
  static async createRelease(data: Prisma.ReleaseCreateInput): Promise<ServiceResponse<Release>> {
    try {
      const release = await prisma.release.create({
        data,
        include: {
          artistReleases: true,
          releaseTracks: true,
          releaseUrls: true,
          images: true,
        },
      });
      return { success: true, data: release };
    } catch (error) {
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
}
