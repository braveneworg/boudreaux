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
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRelease);
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release with this title already exists');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.create).mockRejectedValue(initError);

      const result = await ReleaseService.createRelease(createInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.create).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.createRelease(createInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to create release');
      }
    });
  });

  describe('getReleaseById', () => {
    it('should retrieve a release by ID', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(mockRelease);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRelease);
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findUnique).mockRejectedValue(initError);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve release');
      }
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockReleases);
      }
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findMany).mockRejectedValue(initError);

      const result = await ReleaseService.getReleases();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.getReleases();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve releases');
      }
    });
  });

  describe('updateRelease', () => {
    const updateData: Prisma.ReleaseUpdateInput = {
      title: 'Updated Album Title',
    };

    it('should update a release successfully', async () => {
      const updatedRelease = { ...mockRelease, title: 'Updated Album Title' };
      vi.mocked(prisma.release.update).mockResolvedValue(updatedRelease);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedRelease);
      }
      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: updateData,
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

      const result = await ReleaseService.updateRelease('non-existent', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release not found');
      }
    });

    it('should return error when title already exists', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.update).mockRejectedValue(uniqueError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release with this title already exists');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to update release');
      }
    });
  });

  describe('deleteRelease', () => {
    it('should delete a release successfully', async () => {
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockRelease);
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.delete).mockRejectedValue(initError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.delete).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to delete release');
      }
    });
  });

  describe('softDeleteRelease', () => {
    it('should soft delete a release successfully', async () => {
      const softDeletedRelease = { ...mockRelease, deletedOn: new Date() };
      vi.mocked(prisma.release.update).mockResolvedValue(softDeletedRelease);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedOn).not.toBeNull();
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to soft delete release');
      }
    });
  });

  describe('restoreRelease', () => {
    it('should restore a soft-deleted release successfully', async () => {
      const restoredRelease = { ...mockRelease, deletedOn: null };
      vi.mocked(prisma.release.update).mockResolvedValue(restoredRelease);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deletedOn).toBeNull();
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Release not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to restore release');
      }
    });
  });
});
