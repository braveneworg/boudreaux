import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type { Group } from '@/lib/types/media-models';

import type { ServiceResponse } from './service.types';

export class GroupService {
  static async createGroup(data: Prisma.GroupCreateInput): Promise<ServiceResponse<Group>> {
    try {
      const group = await prisma.group.create({
        data,
        include: {
          images: true,
          artistGroups: true,
          urls: true,
        },
      });
      return { success: true, data: group };
    } catch (error) {
      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create group' };
    }
  }
}
