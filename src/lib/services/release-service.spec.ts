/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import type { Format } from '@/lib/types/media-models';

import { ReleaseService } from './release-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../utils/s3-client', () => ({
  deleteS3Object: vi.fn().mockResolvedValue(undefined),
}));

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
    releaseDigitalFormatFile: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    releaseDigitalFormat: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    releasePurchase: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    releaseDownload: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    downloadEvent: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    releaseUrl: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    image: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    artistRelease: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    featuredArtist: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
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
    digitalFormats: [],
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
    suggestedPrice: null,
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
          digitalFormats: {
            include: {
              files: true,
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
          digitalFormats: {
            include: {
              files: {
                orderBy: { trackNumber: 'asc' },
              },
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

    it('should update a release successfully', async () => {
      const updatedRelease = { ...mockRelease, title: 'Updated Album Title' };
      vi.mocked(prisma.release.update).mockResolvedValue(updatedRelease);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedRelease });
    });

    it('should return error when release not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.update).mockRejectedValue(notFoundError);

      const result = await ReleaseService.updateRelease('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when title already exists', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.update).mockRejectedValue(uniqueError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({
        success: false,
        error: 'Release with this title already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.update).mockRejectedValue(initError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update release' });
    });
  });

  describe('deleteRelease', () => {
    const existingRelease = {
      id: 'release-123',
      coverArt: null,
      digitalFormats: [
        {
          id: 'format-1',
          files: [
            { id: 'file-1', s3Key: 'releases/release-123/mp3/track1.mp3' },
            { id: 'file-2', s3Key: 'releases/release-123/mp3/track2.mp3' },
          ],
        },
      ],
      images: [{ id: 'img-1', src: 'https://cdn.example.com/cover.jpg' }],
    };

    it('should delete a release successfully with cascade', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(existingRelease as never);
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: true, data: mockRelease });
      // Verify cascade delete order
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        include: {
          digitalFormats: { include: { files: true } },
          images: true,
        },
      });
      expect(prisma.releaseDigitalFormatFile.deleteMany).toHaveBeenCalledWith({
        where: { formatId: 'format-1' },
      });
      expect(prisma.releaseDigitalFormat.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.releasePurchase.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.releaseDownload.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.downloadEvent.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.releaseUrl.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.image.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.artistRelease.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
      expect(prisma.featuredArtist.updateMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
        data: { releaseId: null },
      });
      expect(prisma.release.delete).toHaveBeenCalledWith({
        where: { id: 'release-123' },
      });
    });

    it('should return error when release not found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(null);

      const result = await ReleaseService.deleteRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when release not found during delete step', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(existingRelease as never);
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.release.delete).mockRejectedValue(notFoundError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.release.findUnique).mockRejectedValue(initError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(existingRelease as never);
      vi.mocked(prisma.release.delete).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete release' });
    });

    it('should extract S3 key from CDN domain image URLs', async () => {
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      const { deleteS3Object } = await import('../utils/s3-client');

      const releaseWithCdnImages = {
        ...existingRelease,
        coverArt: null,
        images: [{ id: 'img-1', src: 'https://cdn.example.com/releases/cover.jpg' }],
      };
      vi.mocked(prisma.release.findUnique).mockResolvedValue(releaseWithCdnImages as never);
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).toHaveBeenCalledWith('releases/cover.jpg');
      vi.unstubAllEnvs();
    });

    it('should extract S3 key from S3-style image URLs', async () => {
      delete process.env.CDN_DOMAIN;
      const { deleteS3Object } = await import('../utils/s3-client');

      const releaseWithS3Images = {
        ...existingRelease,
        coverArt: null,
        images: [
          {
            id: 'img-1',
            src: 'https://bucket-name.s3.us-east-1.amazonaws.com/releases/cover.jpg',
          },
        ],
      };
      vi.mocked(prisma.release.findUnique).mockResolvedValue(releaseWithS3Images as never);
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).toHaveBeenCalledWith('releases/cover.jpg');
    });

    it('should extract S3 key from coverArt URL during delete', async () => {
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      const { deleteS3Object } = await import('../utils/s3-client');

      const releaseWithCoverArt = {
        ...existingRelease,
        coverArt: 'https://cdn.example.com/covers/album.jpg',
        images: [],
      };
      vi.mocked(prisma.release.findUnique).mockResolvedValue(releaseWithCoverArt as never);
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).toHaveBeenCalledWith('covers/album.jpg');
      vi.unstubAllEnvs();
    });

    it('should not extract S3 key when URL has no S3 pattern and no CDN domain', async () => {
      delete process.env.CDN_DOMAIN;
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(deleteS3Object).mockClear();

      const releaseWithExternalImages = {
        ...existingRelease,
        coverArt: null,
        images: [{ id: 'img-1', src: 'https://external.example.com/image.jpg' }],
        digitalFormats: [],
      };
      vi.mocked(prisma.release.findUnique).mockResolvedValue(releaseWithExternalImages as never);
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).not.toHaveBeenCalled();
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
          digitalFormats: {
            include: {
              files: true,
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
          digitalFormats: {
            include: {
              files: true,
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

    it('should filter by publishedAt not null and deletedOn null or unset', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([]);

      await ReleaseService.getPublishedReleases();

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            publishedAt: { not: null },
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
          },
          orderBy: { releasedOn: 'desc' },
        })
      );
    });

    it('should include images, artistReleases with artist, and releaseUrls', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockPublishedRelease]);

      await ReleaseService.getPublishedReleases();

      expect(prisma.release.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            images: expect.anything(),
            artistReleases: expect.objectContaining({
              include: expect.objectContaining({
                artist: true,
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

    it('should bypass withCache in development mode', async () => {
      const { withCache } = await import('../utils/simple-cache');
      vi.stubEnv('NODE_ENV', 'development');
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockPublishedRelease]);

      const result = await ReleaseService.getPublishedReleases();

      expect(result.success).toBe(true);
      expect(withCache).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
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
      digitalFormats: [
        {
          id: 'df-1',
          releaseId: 'release-123',
          format: 'MP3_320KBPS',
          files: [
            {
              id: 'f-1',
              trackNumber: 1,
              fileName: 'track-one.mp3',
              fileSize: 10485760,
            },
            {
              id: 'f-2',
              trackNumber: 2,
              fileName: 'track-two.mp3',
              fileSize: 9437184,
            },
          ],
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
      expect(result).toHaveProperty('data.digitalFormats');
      const { data } = result as unknown as { data: { digitalFormats: unknown[] } };
      expect(data.digitalFormats).toHaveLength(1);
    });

    it('should filter by id, publishedAt not null, and deletedOn null or unset', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockReleaseWithTracks);

      await ReleaseService.getReleaseWithTracks('release-123');

      expect(prisma.release.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'release-123',
            publishedAt: { not: null },
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
          },
        })
      );
    });

    it('should query digital format files ordered by trackNumber', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockReleaseWithTracks);

      await ReleaseService.getReleaseWithTracks('release-123');

      expect(prisma.release.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            digitalFormats: {
              include: {
                files: {
                  orderBy: { trackNumber: 'asc' },
                },
              },
            },
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
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
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
