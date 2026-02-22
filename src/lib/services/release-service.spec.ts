/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import type { Format } from '@/lib/types/media-models';

import { ReleaseService } from './release-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../prisma', () => ({
  prisma: {
    release: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    track: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../utils/simple-cache', () => ({
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>, _ttl?: number) => fn()),
}));

describe('ReleaseService', () => {
  const mockRelease = {
    id: 'release-123',
    title: 'Test Album',
    labels: ['Test Label'],
    releasedOn: new Date('2024-01-15'),
    catalogNumber: 'TEST-001',
    coverArt: 'https://example.com/cover.jpg',
    description: 'A test album description',
    downloadUrls: [],
    formats: ['DIGITAL', 'VINYL'] as Format[],
    extendedData: [],
    images: [],
    notes: [],
    executiveProducedBy: [],
    coProducedBy: [],
    masteredBy: [],
    mixedBy: [],
    recordedBy: [],
    artBy: [],
    designBy: [],
    photographyBy: [],
    linerNotesBy: [],
    imageTypes: [],
    variants: [],
    releaseTracks: [],
    artistReleases: [],
    releaseUrls: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedOn: null,
    publishedAt: null,
    featuredOn: null,
    featuredUntil: null,
    featuredDescription: null,
    urls: [],
    featuredArtists: [],
    tagId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRelease', () => {
    const createInput: Prisma.ReleaseCreateInput = {
      title: 'Test Album',
      labels: ['Test Label'],
      releasedOn: new Date('2024-01-15'),
      coverArt: 'https://example.com/cover.jpg',
      formats: ['DIGITAL'],
    };

    it('should create a release successfully', async () => {
      vi.mocked(prisma.release.create).mockResolvedValue(mockRelease);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: true, data: mockRelease });
      expect(prisma.release.create).toHaveBeenCalledWith({
        data: createInput,
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
    });

    it('should return error when title already exists', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.create).mockRejectedValue(prismaError);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Release with this title already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.create).mockRejectedValue(initError);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.create).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create release' });
    });
  });

  describe('getReleaseById', () => {
    it('should retrieve a release by ID', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(mockRelease);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result).toMatchObject({ success: true, data: mockRelease });
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-123' },
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
    });

    it('should return error when release not found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(null);

      const result = await ReleaseService.getReleaseById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findUnique).mockRejectedValue(initError);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve release' });
    });
  });

  describe('getReleases', () => {
    const mockReleases = [
      mockRelease,
      {
        ...mockRelease,
        id: 'release-456',
        title: 'Another Album',
        catalogNumber: 'TEST-002',
      },
    ];

    it('should retrieve all releases with default parameters', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue(mockReleases);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: true, data: mockReleases });
      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
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
    });

    it('should retrieve releases with custom pagination', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockRelease]);

      const result = await ReleaseService.getReleases({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 5,
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
    });

    it('should search across multiple fields', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockRelease]);

      const result = await ReleaseService.getReleases({ search: 'test' });

      expect(result.success).toBe(true);
      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: 'test', mode: 'insensitive' } },
            { catalogNumber: { contains: 'test', mode: 'insensitive' } },
            { description: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 50,
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
    });

    it('should combine pagination and search', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockRelease]);

      const result = await ReleaseService.getReleases({
        skip: 5,
        take: 10,
        search: 'album',
      });

      expect(result.success).toBe(true);
      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: 'album', mode: 'insensitive' } },
            { catalogNumber: { contains: 'album', mode: 'insensitive' } },
            { description: { contains: 'album', mode: 'insensitive' } },
          ],
        },
        skip: 5,
        take: 10,
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
    });

    it('should return empty array when no releases found', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findMany).mockRejectedValue(initError);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve releases' });
    });
  });

  describe('updateRelease', () => {
    const updateData: Prisma.ReleaseUpdateInput = {
      title: 'Updated Album Title',
    };

    const mockReleaseWithTracks = {
      ...mockRelease,
      title: 'Updated Album Title',
      releaseTracks: [
        { id: 'rt-1', releaseId: 'release-123', trackId: 'track-1', position: 1, coverArt: null },
        { id: 'rt-2', releaseId: 'release-123', trackId: 'track-2', position: 2, coverArt: null },
      ],
    };

    it('should update a release successfully', async () => {
      const updatedRelease = { ...mockRelease, title: 'Updated Album Title' };
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          release: { update: vi.fn().mockResolvedValue(updatedRelease) },
          track: { updateMany: vi.fn() },
        };
        return callback(tx as never);
      });

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedRelease });
    });

    it('should publish associated tracks when release is published', async () => {
      const publishDate = new Date('2024-06-01');
      const publishData: Prisma.ReleaseUpdateInput = {
        publishedAt: publishDate,
      };

      // Release was not previously published
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);

      const mockTrackUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
      const publishedRelease = { ...mockReleaseWithTracks, publishedAt: publishDate };
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          release: { update: vi.fn().mockResolvedValue(publishedRelease) },
          track: { updateMany: mockTrackUpdateMany },
        };
        return callback(tx as never);
      });

      const result = await ReleaseService.updateRelease('release-123', publishData);

      expect(result.success).toBe(true);
      expect(mockTrackUpdateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['track-1', 'track-2'] },
          publishedOn: null,
        },
        data: {
          publishedOn: publishDate,
        },
      });
    });

    it('should not publish tracks if release was already published', async () => {
      const publishDate = new Date('2024-06-01');
      const publishData: Prisma.ReleaseUpdateInput = {
        publishedAt: publishDate,
      };

      // Release was already published
      vi.mocked(prisma.release.findUnique).mockResolvedValue({
        publishedAt: new Date('2024-05-01'),
      } as never);

      const mockTrackUpdateMany = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          release: { update: vi.fn().mockResolvedValue(mockReleaseWithTracks) },
          track: { updateMany: mockTrackUpdateMany },
        };
        return callback(tx as never);
      });

      const result = await ReleaseService.updateRelease('release-123', publishData);

      expect(result.success).toBe(true);
      expect(mockTrackUpdateMany).not.toHaveBeenCalled();
    });

    it('should not publish tracks when release has no tracks', async () => {
      const publishDate = new Date('2024-06-01');
      const publishData: Prisma.ReleaseUpdateInput = {
        publishedAt: publishDate,
      };

      // Release was not previously published
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);

      const mockTrackUpdateMany = vi.fn();
      const publishedReleaseNoTracks = {
        ...mockRelease,
        publishedAt: publishDate,
        releaseTracks: [],
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          release: { update: vi.fn().mockResolvedValue(publishedReleaseNoTracks) },
          track: { updateMany: mockTrackUpdateMany },
        };
        return callback(tx as never);
      });

      const result = await ReleaseService.updateRelease('release-123', publishData);

      expect(result.success).toBe(true);
      // trackIds.length is 0, so updateMany should NOT be called
      expect(mockTrackUpdateMany).not.toHaveBeenCalled();
    });

    it('should not publish tracks when updating non-publish fields', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);

      const mockTrackUpdateMany = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          release: { update: vi.fn().mockResolvedValue(mockReleaseWithTracks) },
          track: { updateMany: mockTrackUpdateMany },
        };
        return callback(tx as never);
      });

      const result = await ReleaseService.updateRelease('release-123', { title: 'New Title' });

      expect(result.success).toBe(true);
      expect(mockTrackUpdateMany).not.toHaveBeenCalled();
    });

    it('should return error when release not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);
      vi.mocked(prisma.$transaction).mockRejectedValue(notFoundError);

      const result = await ReleaseService.updateRelease('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when title already exists', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);
      vi.mocked(prisma.$transaction).mockRejectedValue(uniqueError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({
        success: false,
        error: 'Release with this title already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);
      vi.mocked(prisma.$transaction).mockRejectedValue(initError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ publishedAt: null } as never);
      vi.mocked(prisma.$transaction).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update release' });
    });
  });

  describe('deleteRelease', () => {
    it('should delete a release successfully', async () => {
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: true, data: mockRelease });
      expect(prisma.release.delete).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        include: {
          images: true,
          artistReleases: true,
          releaseTracks: true,
          releaseUrls: true,
        },
      });
    });

    it('should return error when release not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.delete).mockRejectedValue(notFoundError);

      const result = await ReleaseService.deleteRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.delete).mockRejectedValue(initError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.delete).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete release' });
    });
  });

  describe('softDeleteRelease', () => {
    it('should soft delete a release successfully', async () => {
      const softDeletedRelease = { ...mockRelease, deletedOn: new Date() };
      vi.mocked(prisma.release.update).mockResolvedValue(softDeletedRelease);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).not.toBeNull();
      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: expect.any(Date) },
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
    });

    it('should return error when release not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.update).mockRejectedValue(notFoundError);

      const result = await ReleaseService.softDeleteRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to soft delete release' });
    });
  });

  describe('restoreRelease', () => {
    it('should restore a soft-deleted release successfully', async () => {
      const restoredRelease = { ...mockRelease, deletedOn: null };
      vi.mocked(prisma.release.update).mockResolvedValue(restoredRelease);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).toBeNull();
      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: null },
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
    });

    it('should return error when release not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.update).mockRejectedValue(notFoundError);

      const result = await ReleaseService.restoreRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to restore release' });
    });
  });

  // ===========================================================================
  // Public release methods (for /releases pages)
  // ===========================================================================

  describe('getPublishedReleases', () => {
    const mockPublishedRelease = {
      ...mockRelease,
      publishedAt: new Date('2024-01-10'),
      images: [{ id: 'img-1', src: 'https://example.com/img.jpg', altText: 'Cover', sortOrder: 0 }],
      artistReleases: [
        {
          id: 'ar-1',
          artistId: 'artist-1',
          releaseId: 'release-123',
          artist: {
            id: 'artist-1',
            firstName: 'John',
            surname: 'Doe',
            displayName: null,
            groups: [
              {
                id: 'ag-1',
                artistId: 'artist-1',
                groupId: 'group-1',
                group: { id: 'group-1', displayName: 'The Does' },
              },
            ],
          },
        },
      ],
      releaseUrls: [
        {
          id: 'ru-1',
          releaseId: 'release-123',
          urlId: 'url-1',
          url: { id: 'url-1', platform: 'BANDCAMP', url: 'https://label.bandcamp.com/album/test' },
        },
      ],
    };

    it('should return published releases ordered by releasedOn desc', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockPublishedRelease]);

      const result = await ReleaseService.getPublishedReleases();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      const { data } = result as unknown as { data: { id: string }[] };
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('release-123');
    });

    it('should filter by publishedAt not null and deletedOn null', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      await ReleaseService.getPublishedReleases();

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            publishedAt: { not: null },
            deletedOn: null,
          },
          orderBy: { releasedOn: 'desc' },
        })
      );
    });

    it('should include images, artistReleases with artist+groups, and releaseUrls', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockPublishedRelease]);

      await ReleaseService.getPublishedReleases();

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            images: expect.anything(),
            artistReleases: expect.objectContaining({
              include: expect.objectContaining({
                artist: expect.objectContaining({
                  include: expect.objectContaining({
                    groups: expect.anything(),
                  }),
                }),
              }),
            }),
            releaseUrls: expect.objectContaining({
              include: expect.objectContaining({
                url: true,
              }),
            }),
          }),
        })
      );
    });

    it('should return empty array when no published releases exist', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findMany).mockRejectedValue(initError);

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findMany).mockRejectedValue(Error('Unknown'));

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: false, error: 'Failed to fetch published releases' });
    });
  });

  describe('getReleaseWithTracks', () => {
    const mockReleaseWithTracks = {
      ...mockRelease,
      publishedAt: new Date('2024-01-10'),
      images: [{ id: 'img-1', src: 'https://example.com/img.jpg', altText: 'Cover', sortOrder: 0 }],
      artistReleases: [
        {
          id: 'ar-1',
          artistId: 'artist-1',
          releaseId: 'release-123',
          artist: {
            id: 'artist-1',
            firstName: 'John',
            surname: 'Doe',
            displayName: null,
          },
        },
      ],
      releaseTracks: [
        {
          id: 'rt-1',
          releaseId: 'release-123',
          trackId: 'track-1',
          position: 1,
          coverArt: null,
          track: {
            id: 'track-1',
            title: 'Track One',
            duration: 210,
            audioUrl: 'https://example.com/track1.mp3',
            position: 1,
            coverArt: null,
          },
        },
        {
          id: 'rt-2',
          releaseId: 'release-123',
          trackId: 'track-2',
          position: 2,
          coverArt: null,
          track: {
            id: 'track-2',
            title: 'Track Two',
            duration: 185,
            audioUrl: 'https://example.com/track2.mp3',
            position: 2,
            coverArt: null,
          },
        },
      ],
      releaseUrls: [
        {
          id: 'ru-1',
          releaseId: 'release-123',
          urlId: 'url-1',
          url: { id: 'url-1', platform: 'BANDCAMP', url: 'https://label.bandcamp.com/album/test' },
        },
      ],
    };

    it('should return a published release with tracks', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockReleaseWithTracks);

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('data.id', 'release-123');
      expect(result).toHaveProperty('data.releaseTracks');
      const { data } = result as unknown as { data: { releaseTracks: unknown[] } };
      expect(data.releaseTracks).toHaveLength(2);
    });

    it('should filter by id, publishedAt not null, and deletedOn null', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockReleaseWithTracks);

      await ReleaseService.getReleaseWithTracks('release-123');

      expect(prisma.release.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'release-123',
            publishedAt: { not: null },
            deletedOn: null,
          },
        })
      );
    });

    it('should order releaseTracks by position', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockReleaseWithTracks);

      await ReleaseService.getReleaseWithTracks('release-123');

      expect(prisma.release.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            releaseTracks: expect.objectContaining({
              orderBy: { position: 'asc' },
            }),
          }),
        })
      );
    });

    it('should return error when release not found', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(null);

      const result = await ReleaseService.getReleaseWithTracks('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findFirst).mockRejectedValue(initError);

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findFirst).mockRejectedValue(Error('Unknown'));

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve release' });
    });
  });

  describe('getArtistOtherReleases', () => {
    const mockOtherRelease = {
      ...mockRelease,
      id: 'release-456',
      title: 'Other Album',
      coverArt: 'https://example.com/other-cover.jpg',
      releasedOn: new Date('2024-02-01'),
      publishedAt: new Date('2024-01-20'),
      deletedOn: null,
      images: [
        {
          id: 'img-2',
          src: 'https://example.com/other-img.jpg',
          altText: 'Other cover',
          sortOrder: 0,
        },
      ],
    };

    it('should return other published releases by the artist', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockOtherRelease]);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      const { data } = result as unknown as { data: { id: string }[] };
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('release-456');
    });

    it('should filter by artistId, exclude current release, and only include published', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            artistReleases: { some: { artistId: 'artist-1' } },
            id: { not: 'release-123' },
            publishedAt: { not: null },
            deletedOn: null,
          },
          orderBy: { releasedOn: 'desc' },
        })
      );
    });

    it('should include images for cover art display', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            images: expect.anything(),
          }),
        })
      );
    });

    it('should return empty array when no other releases exist', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findMany).mockRejectedValue(initError);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findMany).mockRejectedValue(Error('Unknown'));

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to fetch artist releases',
      });
    });
  });
});
