import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

import type { ServiceResponse } from './service.types';
import type { Release } from '../types/media-models';

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
}
