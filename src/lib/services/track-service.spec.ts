/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only and prisma first to prevent errors from imported modules
import { Prisma } from '@prisma/client';

import { TrackService } from './track-service';
import { prisma } from '../prisma';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    track: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    image: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock @prisma/client after the first vi.mock calls
vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual('@prisma/client');
  return {
    ...actual,
    Prisma: {
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, options: { code: string; clientVersion: string }) {
          super(message);
          this.code = options.code;
        }
      },
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
        constructor(message: string, _clientVersion: string) {
          super(message);
        }
      },
    },
  };
});

describe('TrackService', () => {
  // Mock track data matching the structure returned by TrackService
  // (includes urls, images, releaseTracks, artists from the service include pattern)
  const mockTrack = {
    id: 'track-123',
    title: 'Test Track',
    duration: 225,
    audioUrl: 'https://example.com/audio.mp3',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
    createdAt: new Date('2024-01-15T00:00:00.000Z'),
    updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    deletedOn: null,
    publishedOn: null,
    images: [],
    releaseTracks: [],
    urls: [],
    artists: [],
  };

  const mockCreateInput: Prisma.TrackCreateInput = {
    title: 'Test Track',
    duration: 225,
    audioUrl: 'https://example.com/audio.mp3',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTrack', () => {
    it('should create a track successfully', async () => {
      vi.mocked(prisma.track.create).mockResolvedValue(mockTrack as never);

      const result = await TrackService.createTrack(mockCreateInput);

      expect(result).toMatchObject({ success: true, data: mockTrack });
      expect(prisma.track.create).toHaveBeenCalledWith({
        data: mockCreateInput,
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
    });

    it('should return error for unique constraint violation', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.create).mockRejectedValue(prismaError);

      const result = await TrackService.createTrack(mockCreateInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Track with this title already exists',
      });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.create).mockRejectedValue(prismaError);

      const result = await TrackService.createTrack(mockCreateInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.create).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.createTrack(mockCreateInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create track' });
    });
  });

  describe('getTrackById', () => {
    it('should retrieve a track by ID successfully', async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(mockTrack as never);

      const result = await TrackService.getTrackById('track-123');

      expect(result).toMatchObject({ success: true, data: mockTrack });
      expect(prisma.track.findUnique).toHaveBeenCalledWith({
        where: { id: 'track-123' },
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
    });

    it('should return error when track is not found', async () => {
      vi.mocked(prisma.track.findUnique).mockResolvedValue(null);

      const result = await TrackService.getTrackById('nonexistent-id');

      expect(result).toMatchObject({ success: false, error: 'Track not found' });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.findUnique).mockRejectedValue(prismaError);

      const result = await TrackService.getTrackById('track-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.getTrackById('track-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve track' });
    });
  });

  describe('getTracks', () => {
    const mockTracks = [
      { ...mockTrack, id: 'track-1', title: 'Track 1' },
      { ...mockTrack, id: 'track-2', title: 'Track 2' },
    ];

    it('should retrieve all tracks with default params', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

      const result = await TrackService.getTracks();

      expect(result).toMatchObject({ success: true, data: mockTracks });
      expect(prisma.track.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });

    it('should apply skip and take params', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

      await TrackService.getTracks({ skip: 10, take: 25 });

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 25,
        })
      );
    });

    it('should apply search filter', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

      await TrackService.getTracks({ search: 'test' });

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ title: { contains: 'test', mode: 'insensitive' } }],
          },
        })
      );
    });

    it('should apply releaseId filter', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

      await TrackService.getTracks({ releaseId: 'release-456' });

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            releaseTracks: {
              some: {
                releaseId: 'release-456',
              },
            },
          },
        })
      );
    });

    it('should apply both search and releaseId filters together', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue(mockTracks as never);

      await TrackService.getTracks({ search: 'test', releaseId: 'release-456' });

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ title: { contains: 'test', mode: 'insensitive' } }],
            releaseTracks: {
              some: {
                releaseId: 'release-456',
              },
            },
          },
        })
      );
    });

    it('should return empty array when no tracks exist', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValue([]);

      const result = await TrackService.getTracks();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.findMany).mockRejectedValue(prismaError);

      const result = await TrackService.getTracks();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.getTracks();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve tracks' });
    });
  });

  describe('getTracksCount', () => {
    it('should return count of all tracks without search', async () => {
      vi.mocked(prisma.track.count).mockResolvedValue(42);

      const result = await TrackService.getTracksCount();

      expect(result).toMatchObject({ success: true, data: 42 });
      expect(prisma.track.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('should return count of tracks matching search query', async () => {
      vi.mocked(prisma.track.count).mockResolvedValue(5);

      const result = await TrackService.getTracksCount('test');

      expect(result).toMatchObject({ success: true, data: 5 });
      expect(prisma.track.count).toHaveBeenCalledWith({
        where: {
          OR: [{ title: { contains: 'test', mode: 'insensitive' } }],
        },
      });
    });

    it('should return count of tracks matching releaseId', async () => {
      vi.mocked(prisma.track.count).mockResolvedValue(8);

      const result = await TrackService.getTracksCount(undefined, 'release-456');

      expect(result).toMatchObject({ success: true, data: 8 });
      expect(prisma.track.count).toHaveBeenCalledWith({
        where: {
          releaseTracks: {
            some: {
              releaseId: 'release-456',
            },
          },
        },
      });
    });

    it('should return count with both search and releaseId filters', async () => {
      vi.mocked(prisma.track.count).mockResolvedValue(3);

      const result = await TrackService.getTracksCount('test', 'release-456');

      expect(result).toMatchObject({ success: true, data: 3 });
      expect(prisma.track.count).toHaveBeenCalledWith({
        where: {
          OR: [{ title: { contains: 'test', mode: 'insensitive' } }],
          releaseTracks: {
            some: {
              releaseId: 'release-456',
            },
          },
        },
      });
    });

    it('should return 0 when no tracks exist', async () => {
      vi.mocked(prisma.track.count).mockResolvedValue(0);

      const result = await TrackService.getTracksCount();

      expect(result).toMatchObject({ success: true, data: 0 });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.count).mockRejectedValue(prismaError);

      const result = await TrackService.getTracksCount();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.count).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.getTracksCount();

      expect(result).toMatchObject({ success: false, error: 'Failed to count tracks' });
    });
  });

  describe('updateTrack', () => {
    const mockUpdateInput: Prisma.TrackUpdateInput = {
      title: 'Updated Track',
      duration: 300,
    };

    it('should update a track successfully', async () => {
      const updatedTrack = { ...mockTrack, title: 'Updated Track', duration: 300 };
      vi.mocked(prisma.track.update).mockResolvedValue(updatedTrack as never);

      const result = await TrackService.updateTrack('track-123', mockUpdateInput);

      expect(result).toMatchObject({ success: true, data: updatedTrack });
      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-123' },
        data: mockUpdateInput,
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
    });

    it('should return error when track is not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.updateTrack('nonexistent-id', mockUpdateInput);

      expect(result).toMatchObject({ success: false, error: 'Track not found' });
    });

    it('should return error for unique constraint violation', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.updateTrack('track-123', mockUpdateInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Track with this title already exists',
      });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.updateTrack('track-123', mockUpdateInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.update).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.updateTrack('track-123', mockUpdateInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to update track' });
    });
  });

  describe('deleteTrack', () => {
    it('should delete a track successfully', async () => {
      vi.mocked(prisma.track.delete).mockResolvedValue(mockTrack as never);

      const result = await TrackService.deleteTrack('track-123');

      expect(result).toMatchObject({ success: true, data: mockTrack });
      expect(prisma.track.delete).toHaveBeenCalledWith({
        where: { id: 'track-123' },
        include: {
          images: true,
          urls: true,
          releaseTracks: true,
          artists: true,
        },
      });
    });

    it('should return error when track is not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.delete).mockRejectedValue(prismaError);

      const result = await TrackService.deleteTrack('nonexistent-id');

      expect(result).toMatchObject({ success: false, error: 'Track not found' });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.delete).mockRejectedValue(prismaError);

      const result = await TrackService.deleteTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.delete).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.deleteTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete track' });
    });
  });

  describe('softDeleteTrack', () => {
    it('should soft delete a track successfully', async () => {
      const softDeletedTrack = { ...mockTrack, deletedOn: new Date() };
      vi.mocked(prisma.track.update).mockResolvedValue(softDeletedTrack as never);

      const result = await TrackService.softDeleteTrack('track-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).not.toBeNull();
      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-123' },
        data: { deletedOn: expect.any(Date) },
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
    });

    it('should return error when track is not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.softDeleteTrack('nonexistent-id');

      expect(result).toMatchObject({ success: false, error: 'Track not found' });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.softDeleteTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.update).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.softDeleteTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to soft delete track' });
    });
  });

  describe('restoreTrack', () => {
    it('should restore a soft-deleted track successfully', async () => {
      const restoredTrack = { ...mockTrack, deletedOn: null };
      vi.mocked(prisma.track.update).mockResolvedValue(restoredTrack as never);

      const result = await TrackService.restoreTrack('track-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).toBeNull();
      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-123' },
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
    });

    it('should return error when track is not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.restoreTrack('nonexistent-id');

      expect(result).toMatchObject({ success: false, error: 'Track not found' });
    });

    it('should return error for database initialization failure', async () => {
      const prismaError = new Prisma.PrismaClientInitializationError(
        'Database connection failed',
        '5.0.0'
      );

      vi.mocked(prisma.track.update).mockRejectedValue(prismaError);

      const result = await TrackService.restoreTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return generic error for unknown failures', async () => {
      vi.mocked(prisma.track.update).mockRejectedValue(Error('Unknown error'));

      const result = await TrackService.restoreTrack('track-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to restore track' });
    });
  });
});
