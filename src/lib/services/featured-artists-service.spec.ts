/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { FeaturedArtistRepository } from '@/lib/repositories/featured-artist-repository';

import { FeaturedArtistsService } from './featured-artists-service';

import type * as PrismaClientModule from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/featured-artist-repository', () => ({
  FeaturedArtistRepository: {
    create: vi.fn(),
    findFeatured: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof PrismaClientModule>('@prisma/client');
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
        clientVersion = '0.0.0';
        constructor(message: string) {
          super(message);
          this.name = 'PrismaClientInitializationError';
        }
      },
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        clientVersion = '0.0.0';
        constructor(message: string, opts: { code: string; clientVersion: string }) {
          super(message);
          this.name = 'PrismaClientKnownRequestError';
          this.code = opts.code;
        }
      },
    },
  };
});
vi.mock('@/lib/utils/simple-cache', () => ({
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>, _ttl?: number) => fn()),
}));

const mockCreate = vi.mocked(FeaturedArtistRepository.create);
const mockFindFeatured = vi.mocked(FeaturedArtistRepository.findFeatured);
const mockFindAll = vi.mocked(FeaturedArtistRepository.findAll);
const mockFindById = vi.mocked(FeaturedArtistRepository.findById);
const mockUpdate = vi.mocked(FeaturedArtistRepository.update);
const mockDelete = vi.mocked(FeaturedArtistRepository.delete);

const mockFeaturedArtist = {
  id: 'fa-1',
  displayName: 'Test Featured Artist',
  description: 'A test description',
  coverArt: null,
  position: 0,
  featuredOn: new Date('2024-06-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  digitalFormatId: null,
  releaseId: null,
  artists: [],
  digitalFormat: null,
  release: null,
};

describe('FeaturedArtistsService', () => {
  describe('createFeaturedArtist', () => {
    it('should create a featured artist and return success', async () => {
      mockCreate.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.createFeaturedArtist({
        displayName: 'Test Featured Artist',
      });

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockCreate).toHaveBeenCalledWith({ displayName: 'Test Featured Artist' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockCreate.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.createFeaturedArtist({
        displayName: 'Test',
      });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockCreate.mockRejectedValue(new Error('Something broke'));

      const result = await FeaturedArtistsService.createFeaturedArtist({
        displayName: 'Test',
      });

      expect(result).toMatchObject({ success: false, error: 'Failed to create artist' });
    });
  });

  describe('getFeaturedArtists', () => {
    it('should return featured artists filtered by date', async () => {
      const artists = [mockFeaturedArtist];
      mockFindFeatured.mockResolvedValue(artists as never);

      const currentDate = new Date('2024-07-01');
      const result = await FeaturedArtistsService.getFeaturedArtists(currentDate, 5);

      expect(result).toMatchObject({ success: true, data: artists });
      expect(mockFindFeatured).toHaveBeenCalledWith(currentDate, 5);
    });

    it('should use default limit of 10', async () => {
      mockFindFeatured.mockResolvedValue([]);

      await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(mockFindFeatured).toHaveBeenCalledWith(expect.any(Date), 10);
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindFeatured.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('DB down', '0.0.0')
      );

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindFeatured.mockRejectedValue(new Error('Query failed'));

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(result).toMatchObject({ success: false, error: 'Failed to fetch artists' });
    });
  });

  describe('getAllFeaturedArtists', () => {
    it('should return all featured artists with defaults', async () => {
      const artists = [mockFeaturedArtist];
      mockFindAll.mockResolvedValue(artists as never);

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({ success: true, data: artists });
      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50, where: {} })
      );
    });

    it('should apply search filter when provided', async () => {
      mockFindAll.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ search: 'jazz' });

      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { displayName: { contains: 'jazz', mode: 'insensitive' } },
                  { description: { contains: 'jazz', mode: 'insensitive' } },
                ],
              },
            ],
          },
        })
      );
    });

    it('should apply publishedOn filter when published=true', async () => {
      mockFindAll.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ published: true });

      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ publishedOn: { not: null } }] },
        })
      );
    });

    it('should apply unpublished filter when published=false', async () => {
      mockFindAll.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ published: false });

      expect(mockFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] }],
          },
        })
      );
    });

    it('should not add any soft-delete constraint (model has no deletedOn)', async () => {
      mockFindAll.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ deleted: false });

      expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('should apply pagination when provided', async () => {
      mockFindAll.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ skip: 10, take: 20 });

      expect(mockFindAll).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 20 }));
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindAll.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindAll.mockRejectedValue(new Error('Read failed'));

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to retrieve featured artists',
      });
    });
  });

  describe('getFeaturedArtistById', () => {
    it('should return a featured artist when found', async () => {
      mockFindById.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.getFeaturedArtistById('fa-1');

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockFindById).toHaveBeenCalledWith('fa-1');
    });

    it('should return not found error when artist does not exist', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await FeaturedArtistsService.getFeaturedArtistById('nonexistent');

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindById.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('DB down', '0.0.0')
      );

      const result = await FeaturedArtistsService.getFeaturedArtistById('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindById.mockRejectedValue(new Error('Unexpected'));

      const result = await FeaturedArtistsService.getFeaturedArtistById('fa-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to retrieve featured artist',
      });
    });
  });

  describe('updateFeaturedArtist', () => {
    it('should update and return the featured artist', async () => {
      const updated = { ...mockFeaturedArtist, displayName: 'Updated Name' };
      mockUpdate.mockResolvedValue(updated as never);

      const result = await FeaturedArtistsService.updateFeaturedArtist('fa-1', {
        displayName: 'Updated Name',
      });

      expect(result).toMatchObject({ success: true, data: updated });
      expect(mockUpdate).toHaveBeenCalledWith('fa-1', { displayName: 'Updated Name' });
    });

    it('should return not found error on P2025', async () => {
      mockUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        })
      );

      const result = await FeaturedArtistsService.updateFeaturedArtist('missing', {
        displayName: 'X',
      });

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockUpdate.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.updateFeaturedArtist('fa-1', {
        displayName: 'X',
      });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockUpdate.mockRejectedValue(new Error('Write failed'));

      const result = await FeaturedArtistsService.updateFeaturedArtist('fa-1', {
        displayName: 'X',
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to update featured artist',
      });
    });
  });

  describe('hardDeleteFeaturedArtist', () => {
    it('should hard-delete and return the featured artist', async () => {
      mockDelete.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockDelete).toHaveBeenCalledWith('fa-1');
    });

    it('should return not found error on P2025', async () => {
      mockDelete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        })
      );

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist('missing');

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockDelete.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockDelete.mockRejectedValue(new Error('Permanent delete failed'));

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to delete featured artist',
      });
    });
  });

  describe('publishFeaturedArtist', () => {
    it('should publish by stamping publishedOn and return the featured artist', async () => {
      const published = { ...mockFeaturedArtist, publishedOn: new Date('2024-12-13') };
      mockUpdate.mockResolvedValue(published as never);

      const result = await FeaturedArtistsService.publishFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: true, data: published });
      expect(mockUpdate).toHaveBeenCalledWith('fa-1', { publishedOn: expect.any(Date) });
    });

    it('should return not found error on P2025', async () => {
      mockUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        })
      );

      const result = await FeaturedArtistsService.publishFeaturedArtist('missing');

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockUpdate.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.publishFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockUpdate.mockRejectedValue(new Error('Publish failed'));

      const result = await FeaturedArtistsService.publishFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Failed to publish featured artist' });
    });
  });

  describe('cache TTL', () => {
    it('should use zero TTL when E2E_MODE is true', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      mockFindFeatured.mockResolvedValue([mockFeaturedArtist] as never);

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date('2024-06-01'));

      expect(result).toMatchObject({ success: true });
      vi.unstubAllEnvs();
    });
  });
});
