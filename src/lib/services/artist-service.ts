import 'server-only';

import { Prisma } from '@prisma/client';

import type { Artist } from '@/lib/types/media-models';

import { prisma } from '../prisma';

import type { ServiceResponse } from './service.types';

export class ArtistService {
  /**
   * Create a new artist
   */
  static async createArtist(data: Prisma.ArtistCreateInput): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.create({
        data,
      })) as unknown as Artist;
      return { success: true, data: artist };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Artist with this slug already exists' };
      }

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

  /**
   * Get an artist by ID
   */
  static async getArtistById(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.findUnique({
        where: { id },
      })) as unknown as Artist | null;

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artist' };
    }
  }

  /**
   * Get an artist by slug
   */
  static async getArtistBySlug(slug: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.findUnique({
        where: { slug },
      })) as unknown as Artist | null;

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artist' };
    }
  }

  /**
   * Get all artists with optional filters
   */
  static async getArtists(params?: {
    skip?: number;
    take?: number;
    isActive?: boolean;
    search?: string;
  }): Promise<ServiceResponse<Artist[]>> {
    try {
      const { skip = 0, take = 50, isActive = true, search } = params || {};

      const where: Prisma.ArtistWhereInput = {
        ...(typeof isActive === 'boolean' && { isActive }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { surname: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const artists = (await prisma.artist.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      })) as unknown as Artist[];

      return { success: true, data: artists };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve artists' };
    }
  }

  /**
   * Update an artist by ID
   */
  static async updateArtist(
    id: string,
    data: Prisma.ArtistUpdateInput
  ): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.update({
        where: { id },
        data,
      })) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Artist with this slug already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update artist' };
    }
  }

  /**
   * Delete an artist by ID (hard delete)
   */
  static async deleteArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.delete({
        where: { id },
      })) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete artist' };
    }
  }

  /**
   * Soft delete an artist (archive)
   */
  static async archiveArtist(id: string): Promise<ServiceResponse<Artist>> {
    try {
      const artist = (await prisma.artist.update({
        where: { id },
        data: { archivedAt: new Date() },
      })) as unknown as Artist;

      return { success: true, data: artist };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to archive artist' };
    }
  }
}
