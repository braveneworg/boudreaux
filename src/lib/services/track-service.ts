/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Prisma } from '@prisma/client';

import { prisma } from '../prisma';

import type { ServiceResponse } from './service.types';
import type { Track } from '../types/media-models';

export class TrackService {
  /**
   * Create a new track
   */
  static async createTrack(data: Prisma.TrackCreateInput): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.create({
        data,
        include: {
          urls: true,
          images: true,
          releaseTracks: {
            include: {
              release: true,
            },
          },
          artists: true,
        },
      });
      return { success: true, data: track as unknown as Track };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Track with this title already exists' };
      }

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

  /**
   * Get a track by ID
   */
  static async getTrackById(id: string): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.findUnique({
        where: { id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          urls: true,
          releaseTracks: {
            include: {
              release: true,
            },
          },
          artists: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!track) {
        return { success: false, error: 'Track not found' };
      }

      return { success: true, data: track as unknown as Track };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve track' };
    }
  }

  /**
   * Get all tracks with optional filters
   */
  static async getTracks(params?: {
    skip?: number;
    take?: number;
    search?: string;
    releaseId?: string;
  }): Promise<ServiceResponse<Track[]>> {
    try {
      const { skip = 0, take = 50, search, releaseId } = params || {};

      const where: Prisma.TrackWhereInput = {
        ...(search && {
          OR: [{ title: { contains: search, mode: 'insensitive' } }],
        }),
        ...(releaseId && {
          releaseTracks: {
            some: {
              releaseId,
            },
          },
        }),
      };

      const tracks = await prisma.track.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
          releaseTracks: {
            include: {
              release: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          artists: {
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

      return { success: true, data: tracks as unknown as Track[] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve tracks' };
    }
  }

  /**
   * Get total count of tracks with optional search filter
   */
  static async getTracksCount(
    search?: string,
    releaseId?: string
  ): Promise<ServiceResponse<number>> {
    try {
      const where: Prisma.TrackWhereInput = {
        ...(search && {
          OR: [{ title: { contains: search, mode: 'insensitive' } }],
        }),
        ...(releaseId && {
          releaseTracks: {
            some: {
              releaseId,
            },
          },
        }),
      };

      const count = await prisma.track.count({ where });
      return { success: true, data: count };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to count tracks' };
    }
  }

  /**
   * Update a track by ID
   */
  static async updateTrack(
    id: string,
    data: Prisma.TrackUpdateInput
  ): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.update({
        where: { id },
        data,
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          urls: true,
          releaseTracks: {
            include: {
              release: true,
            },
          },
          artists: true,
        },
      });

      return { success: true, data: track as unknown as Track };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Track not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Track with this title already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update track' };
    }
  }

  /**
   * Delete a track by ID (hard delete)
   */
  static async deleteTrack(id: string): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.delete({
        where: { id },
        include: {
          images: true,
          urls: true,
          releaseTracks: true,
          artists: true,
        },
      });

      return { success: true, data: track as unknown as Track };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Track not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete track' };
    }
  }

  /**
   * Soft delete a track by ID (set deletedOn timestamp)
   */
  static async softDeleteTrack(id: string): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.update({
        where: { id },
        data: { deletedOn: new Date() },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          urls: true,
          releaseTracks: {
            include: {
              release: true,
            },
          },
          artists: true,
        },
      });

      return { success: true, data: track as unknown as Track };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Track not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to soft delete track' };
    }
  }

  /**
   * Restore a soft-deleted track by ID (clear deletedOn timestamp)
   */
  static async restoreTrack(id: string): Promise<ServiceResponse<Track>> {
    try {
      const track = await prisma.track.update({
        where: { id },
        data: { deletedOn: null },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          urls: true,
          releaseTracks: {
            include: {
              release: true,
            },
          },
          artists: true,
        },
      });

      return { success: true, data: track as unknown as Track };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Track not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to restore track' };
    }
  }
}
