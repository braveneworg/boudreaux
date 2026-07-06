/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { DataError } from '@/lib/types/domain/errors';
import type { CreateReleaseData, UpdateReleaseData } from '@/lib/types/domain/release';
import type { Format } from '@/lib/types/media-models';
import { cache } from '@/lib/utils/simple-cache';

import { ReleaseService } from './release-service';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../utils/s3-client', () => ({
  deleteS3Object: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/repositories/release-repository', () => ({
  ReleaseRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateData: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    findForDeletion: vi.fn(),
    delete: vi.fn(),
    deleteReleaseUrls: vi.fn().mockResolvedValue(undefined),
    deleteImages: vi.fn().mockResolvedValue(undefined),
    deleteArtistReleases: vi.fn().mockResolvedValue(undefined),
    clearFeaturedArtistReferences: vi.fn().mockResolvedValue(undefined),
    findPublished: vi.fn(),
    findPublishedWithTracks: vi.fn(),
    findPublishedByArtistExcluding: vi.fn(),
    findByTitleInsensitive: vi.fn(),
    findPublishedTitleById: vi.fn(),
    findTitleById: vi.fn(),
    existsById: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class {
    deleteAllByReleaseId = vi.fn().mockResolvedValue(0);
  },
}));

vi.mock('@/lib/repositories/release-digital-format-file-repository', () => ({
  ReleaseDigitalFormatFileRepository: class {
    deleteAllByFormatId = vi.fn().mockResolvedValue(0);
  },
}));

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    deleteAllByReleaseId: vi.fn().mockResolvedValue(0),
    deleteAllDownloadsByReleaseId: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('@/lib/repositories/download-event-repository', () => ({
  DownloadEventRepository: class {
    deleteAllByReleaseId = vi.fn().mockResolvedValue(0);
  },
}));

vi.mock('../utils/simple-cache', () => ({
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>, _ttl?: number) => fn()),
  cache: { deleteByPrefix: vi.fn() },
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

  describe('createRelease', () => {
    const createInput: CreateReleaseData = {
      title: 'Test Album',
      labels: ['Test Label'],
      releasedOn: new Date('2024-01-15'),
      coverArt: 'https://example.com/cover.jpg',
      formats: ['DIGITAL'],
    };

    it('should create a release successfully', async () => {
      vi.mocked(ReleaseRepository.create).mockResolvedValue(mockRelease as never);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: true, data: mockRelease });
      expect(ReleaseRepository.create).toHaveBeenCalledWith(createInput);
    });

    it('should return error when title already exists', async () => {
      const prismaError = new DataError('DUPLICATE', 'Unique constraint failed');
      vi.mocked(ReleaseRepository.create).mockRejectedValue(prismaError);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Release with this title already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.create).mockRejectedValue(initError);

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.create).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.createRelease(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create release' });
    });
  });

  describe('getReleaseById', () => {
    it('should retrieve a release by ID', async () => {
      vi.mocked(ReleaseRepository.findById).mockResolvedValue(mockRelease as never);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result).toMatchObject({ success: true, data: mockRelease });
      expect(ReleaseRepository.findById).toHaveBeenCalledWith('release-123');
    });

    it('should return error when release not found', async () => {
      vi.mocked(ReleaseRepository.findById).mockResolvedValue(null);

      const result = await ReleaseService.getReleaseById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findById).mockRejectedValue(initError);

      const result = await ReleaseService.getReleaseById('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findById).mockRejectedValue(Error('Unknown error'));

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

    it('should retrieve all releases, forwarding default (empty) filters', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue(mockReleases as never);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: true, data: mockReleases });
      // The repository owns the where/pagination defaults — the service forwards
      // an empty filter object when no params are supplied.
      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({});
    });

    it('forwards pagination filters to the repository', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([mockRelease] as never);

      const result = await ReleaseService.getReleases({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({ skip: 10, take: 5 });
    });

    it('forwards the search filter to the repository', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([mockRelease] as never);

      const result = await ReleaseService.getReleases({ search: 'test' });

      expect(result.success).toBe(true);
      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({ search: 'test' });
    });

    it('forwards the published filter to the repository', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([mockRelease] as never);

      await ReleaseService.getReleases({ published: true });

      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({ published: true });
    });

    it('forwards the deleted filter to the repository', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([mockRelease] as never);

      await ReleaseService.getReleases({ deleted: true });

      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({ deleted: true });
    });

    it('forwards artistIds to the repository', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([mockRelease] as never);

      const result = await ReleaseService.getReleases({ artistIds: ['artist-1', 'artist-2'] });

      expect(result.success).toBe(true);
      expect(ReleaseRepository.findMany).toHaveBeenCalledWith({
        artistIds: ['artist-1', 'artist-2'],
      });
    });

    it('should return empty array when no releases found', async () => {
      vi.mocked(ReleaseRepository.findMany).mockResolvedValue([] as never);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findMany).mockRejectedValue(initError);

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.getReleases();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve releases' });
    });
  });

  describe('updateRelease', () => {
    const updateData: UpdateReleaseData = {
      title: 'Updated Album Title',
    };

    it('should update a release successfully', async () => {
      const updatedRelease = { ...mockRelease, title: 'Updated Album Title' };
      vi.mocked(ReleaseRepository.update).mockResolvedValue(updatedRelease as never);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedRelease });
      expect(ReleaseRepository.update).toHaveBeenCalledWith('release-123', updateData);
    });

    it('should return error when release not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ReleaseRepository.update).mockRejectedValue(notFoundError);

      const result = await ReleaseService.updateRelease('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when title already exists', async () => {
      const uniqueError = new DataError('DUPLICATE', 'Unique constraint failed');
      vi.mocked(ReleaseRepository.update).mockRejectedValue(uniqueError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({
        success: false,
        error: 'Release with this title already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.update).mockRejectedValue(initError);

      const result = await ReleaseService.updateRelease('release-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.update).mockRejectedValue(Error('Unknown error'));

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
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(existingRelease as never);
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: true, data: mockRelease });
      // Verify cascade delete order
      expect(ReleaseRepository.findForDeletion).toHaveBeenCalledWith('release-123');
      expect(PurchaseRepository.deleteAllByReleaseId).toHaveBeenCalledWith('release-123');
      expect(PurchaseRepository.deleteAllDownloadsByReleaseId).toHaveBeenCalledWith('release-123');
      expect(ReleaseRepository.deleteReleaseUrls).toHaveBeenCalledWith('release-123');
      expect(ReleaseRepository.deleteImages).toHaveBeenCalledWith('release-123');
      expect(ReleaseRepository.deleteArtistReleases).toHaveBeenCalledWith('release-123');
      expect(ReleaseRepository.clearFeaturedArtistReferences).toHaveBeenCalledWith('release-123');
      expect(ReleaseRepository.delete).toHaveBeenCalledWith('release-123');
    });

    it('should return error when release not found', async () => {
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(null);

      const result = await ReleaseService.deleteRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when release not found during delete step', async () => {
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(existingRelease as never);
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ReleaseRepository.delete).mockRejectedValue(notFoundError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findForDeletion).mockRejectedValue(initError);

      const result = await ReleaseService.deleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(existingRelease as never);
      vi.mocked(ReleaseRepository.delete).mockRejectedValue(Error('Unknown error'));

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
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(releaseWithCdnImages as never);
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

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
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(releaseWithS3Images as never);
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

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
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(releaseWithCoverArt as never);
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

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
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(
        releaseWithExternalImages as never
      );
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).not.toHaveBeenCalled();
    });

    it('should skip files without an s3Key when collecting deletion targets', async () => {
      delete process.env.CDN_DOMAIN;
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(deleteS3Object).mockClear();

      const releaseWithEmptyKey = {
        ...existingRelease,
        coverArt: null,
        images: [],
        digitalFormats: [
          {
            id: 'format-1',
            files: [
              { id: 'file-no-key', s3Key: null },
              { id: 'file-with-key', s3Key: 'releases/release-123/mp3/track1.mp3' },
            ],
          },
        ],
      };
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(releaseWithEmptyKey as never);
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).toHaveBeenCalledTimes(1);
      expect(deleteS3Object).toHaveBeenCalledWith('releases/release-123/mp3/track1.mp3');
    });

    it('should not extract an S3 key when ".s3." appears but the path tail is empty', async () => {
      delete process.env.CDN_DOMAIN;
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(deleteS3Object).mockClear();

      const releaseWithMalformedS3Url = {
        ...existingRelease,
        coverArt: null,
        images: [{ id: 'img-1', src: 'https://bucket.s3.' }],
        digitalFormats: [],
      };
      vi.mocked(ReleaseRepository.findForDeletion).mockResolvedValue(
        releaseWithMalformedS3Url as never
      );
      vi.mocked(ReleaseRepository.delete).mockResolvedValue(mockRelease as never);

      await ReleaseService.deleteRelease('release-123');

      expect(deleteS3Object).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteRelease', () => {
    it('should soft delete a release successfully', async () => {
      const softDeletedRelease = { ...mockRelease, deletedOn: new Date() };
      vi.mocked(ReleaseRepository.softDelete).mockResolvedValue(softDeletedRelease as never);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).not.toBeNull();
      expect(ReleaseRepository.softDelete).toHaveBeenCalledWith('release-123');
    });

    it('should return error when release not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ReleaseRepository.softDelete).mockRejectedValue(notFoundError);

      const result = await ReleaseService.softDeleteRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.softDelete).mockRejectedValue(initError);

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.softDelete).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.softDeleteRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to soft delete release' });
    });
  });

  describe('restoreRelease', () => {
    it('should restore a soft-deleted release successfully', async () => {
      const restoredRelease = { ...mockRelease, deletedOn: null };
      vi.mocked(ReleaseRepository.restore).mockResolvedValue(restoredRelease as never);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result.success).toBe(true);
      expect(
        (result as { success: true; data: { deletedOn: Date | null } }).data.deletedOn
      ).toBeNull();
      expect(ReleaseRepository.restore).toHaveBeenCalledWith('release-123');
    });

    it('should return error when release not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ReleaseRepository.restore).mockRejectedValue(notFoundError);

      const result = await ReleaseService.restoreRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.restore).mockRejectedValue(initError);

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.restore).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.restoreRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to restore release' });
    });
  });

  describe('publishRelease', () => {
    it('should publish a release by stamping publishedAt', async () => {
      const publishedRelease = { ...mockRelease, publishedAt: new Date('2024-12-13') };
      vi.mocked(ReleaseRepository.update).mockResolvedValue(publishedRelease as never);

      const result = await ReleaseService.publishRelease('release-123');

      expect(result).toMatchObject({ success: true, data: publishedRelease });
      expect(ReleaseRepository.update).toHaveBeenCalledWith('release-123', {
        publishedAt: expect.any(Date),
      });
    });

    it('should return error when release not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ReleaseRepository.update).mockRejectedValue(notFoundError);

      const result = await ReleaseService.publishRelease('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.update).mockRejectedValue(initError);

      const result = await ReleaseService.publishRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ReleaseService.publishRelease('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to publish release' });
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
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([mockPublishedRelease] as never);

      const result = await ReleaseService.getPublishedReleases();

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      const { data } = result as unknown as { data: { id: string }[] };
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('release-123');
    });

    it('forwards default skip/take to the repository (where-building is owned by the repo)', async () => {
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([] as never);

      await ReleaseService.getPublishedReleases();

      expect(ReleaseRepository.findPublished).toHaveBeenCalledWith({
        skip: 0,
        take: 24,
        search: undefined,
      });
    });

    it('applies skip/take pagination', async () => {
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([] as never);

      await ReleaseService.getPublishedReleases({ skip: 24, take: 12 });

      expect(ReleaseRepository.findPublished).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 24, take: 12 })
      );
    });

    it('forwards the search term to the repository', async () => {
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([] as never);

      await ReleaseService.getPublishedReleases({ search: 'Doe' });

      expect(ReleaseRepository.findPublished).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Doe' })
      );
    });

    it('should return empty array when no published releases exist', async () => {
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([] as never);

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findPublished).mockRejectedValue(initError);

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findPublished).mockRejectedValue(Error('Unknown'));

      const result = await ReleaseService.getPublishedReleases();

      expect(result).toMatchObject({ success: false, error: 'Failed to fetch published releases' });
    });

    it('should bypass withCache in development mode', async () => {
      const { withCache } = await import('../utils/simple-cache');
      vi.stubEnv('NODE_ENV', 'development');
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([mockPublishedRelease] as never);

      const result = await ReleaseService.getPublishedReleases();

      expect(result.success).toBe(true);
      expect(withCache).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('should bypass withCache in E2E mode', async () => {
      const { withCache } = await import('../utils/simple-cache');
      vi.stubEnv('E2E_MODE', 'true');
      vi.mocked(ReleaseRepository.findPublished).mockResolvedValue([mockPublishedRelease] as never);

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
      digitalFormats: [
        {
          id: 'df-1',
          releaseId: 'release-123',
          format: 'MP3_320KBPS',
          files: [
            { id: 'f-1', trackNumber: 1, fileName: 'track-one.mp3', fileSize: 10485760 },
            { id: 'f-2', trackNumber: 2, fileName: 'track-two.mp3', fileSize: 9437184 },
          ],
        },
      ],
    };

    it('should return a published release with tracks', async () => {
      vi.mocked(ReleaseRepository.findPublishedWithTracks).mockResolvedValue(
        mockReleaseWithTracks as never
      );

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data.id', 'release-123');
      const { data } = result as unknown as { data: { digitalFormats: unknown[] } };
      expect(data.digitalFormats).toHaveLength(1);
    });

    it('should delegate to the repository with the release id', async () => {
      vi.mocked(ReleaseRepository.findPublishedWithTracks).mockResolvedValue(
        mockReleaseWithTracks as never
      );

      await ReleaseService.getReleaseWithTracks('release-123');

      expect(ReleaseRepository.findPublishedWithTracks).toHaveBeenCalledWith('release-123');
    });

    it('should return error when release not found', async () => {
      vi.mocked(ReleaseRepository.findPublishedWithTracks).mockResolvedValue(null);

      const result = await ReleaseService.getReleaseWithTracks('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Release not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findPublishedWithTracks).mockRejectedValue(initError);

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findPublishedWithTracks).mockRejectedValue(Error('Unknown'));

      const result = await ReleaseService.getReleaseWithTracks('release-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve release' });
    });
  });

  describe('getArtistOtherReleases', () => {
    const mockOtherRelease = {
      ...mockRelease,
      id: 'release-456',
      title: 'Other Album',
    };

    it('should return other published releases by the artist', async () => {
      vi.mocked(ReleaseRepository.findPublishedByArtistExcluding).mockResolvedValue([
        mockOtherRelease,
      ] as never);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result.success).toBe(true);
      const { data } = result as unknown as { data: { id: string }[] };
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('release-456');
    });

    it('should delegate to the repository with artistId and exclude id', async () => {
      vi.mocked(ReleaseRepository.findPublishedByArtistExcluding).mockResolvedValue([] as never);

      await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(ReleaseRepository.findPublishedByArtistExcluding).toHaveBeenCalledWith(
        'artist-1',
        'release-123'
      );
    });

    it('should return empty array when no other releases exist', async () => {
      vi.mocked(ReleaseRepository.findPublishedByArtistExcluding).mockResolvedValue([] as never);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ReleaseRepository.findPublishedByArtistExcluding).mockRejectedValue(initError);

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ReleaseRepository.findPublishedByArtistExcluding).mockRejectedValue(
        Error('Unknown')
      );

      const result = await ReleaseService.getArtistOtherReleases('artist-1', 'release-123');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to fetch artist releases',
      });
    });
  });

  describe('applyFoundReleaseUpdate', () => {
    it('clears deletedOn when undelete is true', async () => {
      vi.mocked(ReleaseRepository.updateData).mockResolvedValue(mockRelease as never);

      await ReleaseService.applyFoundReleaseUpdate('release-123', { undelete: true });

      expect(ReleaseRepository.updateData).toHaveBeenCalledWith('release-123', {
        deletedOn: null,
      });
    });

    it('sets publishedAt when publish is true', async () => {
      vi.mocked(ReleaseRepository.updateData).mockResolvedValue(mockRelease as never);

      await ReleaseService.applyFoundReleaseUpdate('release-123', { publish: true });

      const call = vi.mocked(ReleaseRepository.updateData).mock.calls.at(-1);
      expect(call?.[0]).toBe('release-123');
      expect(call?.[1]).toEqual({ publishedAt: expect.any(Date) });
    });

    it('combines both updates when both flags are set', async () => {
      vi.mocked(ReleaseRepository.updateData).mockResolvedValue(mockRelease as never);

      await ReleaseService.applyFoundReleaseUpdate('release-123', {
        undelete: true,
        publish: true,
      });

      const data = vi.mocked(ReleaseRepository.updateData).mock.calls.at(-1)?.[1];
      expect(data).toMatchObject({ deletedOn: null, publishedAt: expect.any(Date) });
    });

    it('is a no-op when neither flag is set', async () => {
      vi.mocked(ReleaseRepository.updateData).mockClear();

      await ReleaseService.applyFoundReleaseUpdate('release-123', {});

      expect(ReleaseRepository.updateData).not.toHaveBeenCalled();
    });
  });

  describe('findByTitleInsensitive', () => {
    it('should return a release when found by title', async () => {
      const mockResult = {
        id: 'r-1',
        title: 'Test Album',
        publishedAt: null,
        deletedOn: null,
      };
      vi.mocked(ReleaseRepository.findByTitleInsensitive).mockResolvedValue(mockResult);

      const result = await ReleaseService.findByTitleInsensitive('test album');

      expect(result).toEqual(mockResult);
      expect(ReleaseRepository.findByTitleInsensitive).toHaveBeenCalledWith('test album');
    });

    it('should return null when no release matches the title', async () => {
      vi.mocked(ReleaseRepository.findByTitleInsensitive).mockResolvedValue(null);

      const result = await ReleaseService.findByTitleInsensitive('missing title');

      expect(result).toBeNull();
    });
  });

  describe('findTitleById', () => {
    it('should return id and title when release is found', async () => {
      vi.mocked(ReleaseRepository.findTitleById).mockResolvedValue({
        id: 'r-1',
        title: 'Test Album',
      });

      const result = await ReleaseService.findTitleById('r-1');

      expect(result).toEqual({ id: 'r-1', title: 'Test Album' });
    });

    it('should return null when release is not found', async () => {
      vi.mocked(ReleaseRepository.findTitleById).mockResolvedValue(null);

      const result = await ReleaseService.findTitleById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('existsById', () => {
    it('should return true when the release exists', async () => {
      vi.mocked(ReleaseRepository.existsById).mockResolvedValue(true);

      const result = await ReleaseService.existsById('r-1');

      expect(result).toBe(true);
    });

    it('should return false when the release does not exist', async () => {
      vi.mocked(ReleaseRepository.existsById).mockResolvedValue(false);

      const result = await ReleaseService.existsById('missing-id');

      expect(result).toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('clears the cached published-releases listing pages by prefix', () => {
      ReleaseService.invalidateCache();

      expect(cache.deleteByPrefix).toHaveBeenCalledWith('published-releases:');
    });
  });
});
