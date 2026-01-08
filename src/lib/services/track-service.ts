import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

import type { ServiceResponse } from './service.types';
import type { Track } from '../types/media-models';

export class TrackService {
  static async createTrack(data: Prisma.TrackCreateInput): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.create({
        data,
        include: {
          urls: true,
          images: true,
          releaseTracks: true,
        },
      });
      return { success: true, data: track };
    } catch (error) {
      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create track' };
    }
  }
}
