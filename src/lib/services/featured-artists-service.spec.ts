/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import { FeaturedArtistsService } from './featured-artists-service';

import type * as PrismaClientModule from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    featuredArtist: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
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

const mockCreate = vi.mocked(prisma.featuredArtist.create);
const mockFindMany = vi.mocked(prisma.featuredArtist.findMany);
const mockFindUnique = vi.mocked(prisma.featuredArtist.findUnique);
const mockUpdate = vi.mocked(prisma.featuredArtist.update);
const mockDelete = vi.mocked(prisma.featuredArtist.delete);

const mockFeaturedArtist = {
  id: 'fa-1',
  displayName: 'Test Featured Artist',
  description: 'A test description',
  coverArt: null,
  position: 0,
  featuredOn: new Date('2024-06-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  trackId: null,
  releaseId: null,
  groupId: null,
  artists: [],
  track: null,
  release: null,
  group: null,
};

describe('FeaturedArtistsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createFeaturedArtist', () => {
    it('should create a featured artist and return success', async () => {
      mockCreate.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.createFeaturedArtist({
        displayName: 'Test Featured Artist',
      });

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { displayName: 'Test Featured Artist' },
        })
      );
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
      mockFindMany.mockResolvedValue(artists as never);

      const currentDate = new Date('2024-07-01');
      const result = await FeaturedArtistsService.getFeaturedArtists(currentDate, 5);

      expect(result).toMatchObject({ success: true, data: artists });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { featuredOn: { lte: currentDate } },
          orderBy: { featuredOn: 'desc' },
          take: 5,
        })
      );
    });

    it('should use default limit of 10', async () => {
      mockFindMany.mockResolvedValue([]);

      await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindMany.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('DB down', '0.0.0')
      );

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindMany.mockRejectedValue(new Error('Query failed'));

      const result = await FeaturedArtistsService.getFeaturedArtists(new Date());

      expect(result).toMatchObject({ success: false, error: 'Failed to fetch artists' });
    });
  });

  describe('getAllFeaturedArtists', () => {
    it('should return all featured artists with defaults', async () => {
      const artists = [mockFeaturedArtist];
      mockFindMany.mockResolvedValue(artists as never);

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({ success: true, data: artists });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
          orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
        })
      );
    });

    it('should apply search filter when provided', async () => {
      mockFindMany.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ search: 'jazz' });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { displayName: { contains: 'jazz', mode: 'insensitive' } },
              { description: { contains: 'jazz', mode: 'insensitive' } },
            ],
          },
        })
      );
    });

    it('should apply pagination when provided', async () => {
      mockFindMany.mockResolvedValue([]);

      await FeaturedArtistsService.getAllFeaturedArtists({ skip: 10, take: 20 });

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 20 }));
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindMany.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('DB down', '0.0.0')
      );

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindMany.mockRejectedValue(new Error('Read failed'));

      const result = await FeaturedArtistsService.getAllFeaturedArtists();

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to retrieve featured artists',
      });
    });
  });

  describe('getFeaturedArtistById', () => {
    it('should return a featured artist when found', async () => {
      mockFindUnique.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.getFeaturedArtistById('fa-1');

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'fa-1' } })
      );
    });

    it('should return not found error when artist does not exist', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await FeaturedArtistsService.getFeaturedArtistById('nonexistent');

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockFindUnique.mockRejectedValue(
        new Prisma.PrismaClientInitializationError('DB down', '0.0.0')
      );

      const result = await FeaturedArtistsService.getFeaturedArtistById('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockFindUnique.mockRejectedValue(new Error('Unexpected'));

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
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fa-1' },
          data: { displayName: 'Updated Name' },
        })
      );
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

  describe('deleteFeaturedArtist', () => {
    it('should soft-delete and return the featured artist', async () => {
      mockUpdate.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.deleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'fa-1' } }));
    });

    it('should return not found error on P2025', async () => {
      mockUpdate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        })
      );

      const result = await FeaturedArtistsService.deleteFeaturedArtist('missing');

      expect(result).toMatchObject({ success: false, error: 'Featured artist not found' });
    });

    it('should return error on PrismaClientInitializationError', async () => {
      mockUpdate.mockRejectedValue(new Prisma.PrismaClientInitializationError('DB down', '0.0.0'));

      const result = await FeaturedArtistsService.deleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should return error on generic exception', async () => {
      mockUpdate.mockRejectedValue(new Error('Delete failed'));

      const result = await FeaturedArtistsService.deleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({
        success: false,
        error: 'Failed to delete featured artist',
      });
    });
  });

  describe('hardDeleteFeaturedArtist', () => {
    it('should hard-delete and return the featured artist', async () => {
      mockDelete.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistsService.hardDeleteFeaturedArtist('fa-1');

      expect(result).toMatchObject({ success: true, data: mockFeaturedArtist });
      expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'fa-1' } }));
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
});
