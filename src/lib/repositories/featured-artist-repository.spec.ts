/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { DataError } from '@/lib/types/domain/errors';

import { FeaturedArtistRepository, featuredArtistInclude } from './featured-artist-repository';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    featuredArtist: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

const mockCreate = vi.mocked(prisma.featuredArtist.create);
const mockFindMany = vi.mocked(prisma.featuredArtist.findMany);
const mockCount = vi.mocked(prisma.featuredArtist.count);
const mockFindUnique = vi.mocked(prisma.featuredArtist.findUnique);
const mockUpdate = vi.mocked(prisma.featuredArtist.update);
const mockDelete = vi.mocked(prisma.featuredArtist.delete);

const mockFeaturedArtist = { id: 'fa-1', displayName: 'Test' };

describe('FeaturedArtistRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('should create with the full relation include', async () => {
      mockCreate.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.create({ displayName: 'Test' });

      expect(result).toEqual(mockFeaturedArtist);
      expect(mockCreate).toHaveBeenCalledWith({
        data: { displayName: 'Test' },
        include: featuredArtistInclude,
      });
    });

    it('wraps a Prisma error as a DataError', async () => {
      mockCreate.mockRejectedValue(new Prisma.PrismaClientInitializationError('no db', '6'));

      await expect(FeaturedArtistRepository.create({ displayName: 'x' })).rejects.toBeInstanceOf(
        DataError
      );
    });
  });

  describe('findFeatured', () => {
    it('should query with date filter, include, ordering and limit', async () => {
      const artists = [mockFeaturedArtist];
      mockFindMany.mockResolvedValue(artists as never);
      const currentDate = new Date('2024-07-01');

      const result = await FeaturedArtistRepository.findFeatured(currentDate, 5);

      expect(result).toEqual(artists);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          publishedOn: { not: null },
          featuredOn: { lte: currentDate },
          OR: [
            { featuredUntil: null },
            { featuredUntil: { isSet: false } },
            { featuredUntil: { gte: currentDate } },
          ],
        },
        include: featuredArtistInclude,
        orderBy: { featuredOn: 'desc' },
        take: 5,
      });
    });
  });

  describe('findAll', () => {
    it('uses the include, default pagination and ordering with an empty where', async () => {
      const artists = [mockFeaturedArtist];
      mockFindMany.mockResolvedValue(artists as never);

      const result = await FeaturedArtistRepository.findAll({});

      expect(result).toEqual(artists);
      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.skip).toBe(0);
      expect(arg?.take).toBe(50);
      expect(arg?.orderBy).toEqual([{ position: 'asc' }, { featuredOn: 'desc' }]);
      expect(arg?.include).toEqual(featuredArtistInclude);
      expect(arg?.where).toEqual({});
    });

    it('adds a case-insensitive search OR across name and description', async () => {
      mockFindMany.mockResolvedValue([] as never);

      await FeaturedArtistRepository.findAll({ search: 'jazz' });

      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [
          {
            OR: [
              { displayName: { contains: 'jazz', mode: 'insensitive' } },
              { description: { contains: 'jazz', mode: 'insensitive' } },
            ],
          },
        ],
      });
    });

    it('filters to published featured artists when published=true', async () => {
      mockFindMany.mockResolvedValue([] as never);

      await FeaturedArtistRepository.findAll({ published: true });

      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [{ publishedOn: { not: null } }] });
    });

    it('filters to unpublished featured artists when published=false', async () => {
      mockFindMany.mockResolvedValue([] as never);

      await FeaturedArtistRepository.findAll({ published: false });

      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [{ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] }],
      });
    });

    it('applies no soft-delete constraint (model has no deletedOn)', async () => {
      mockFindMany.mockResolvedValue([] as never);

      await FeaturedArtistRepository.findAll({ deleted: false });

      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.where).toEqual({});
    });

    it('applies pagination when provided', async () => {
      mockFindMany.mockResolvedValue([] as never);

      await FeaturedArtistRepository.findAll({ skip: 10, take: 20 });

      const arg = mockFindMany.mock.calls[0]?.[0];
      expect(arg?.skip).toBe(10);
      expect(arg?.take).toBe(20);
    });
  });

  describe('count', () => {
    it('counts all featured artists with no filter', async () => {
      mockCount.mockResolvedValue(7 as never);

      const result = await FeaturedArtistRepository.count();

      expect(result).toBe(7);
      expect(mockCount).toHaveBeenCalledWith({ where: {} });
    });

    it('counts only published featured artists when published=true', async () => {
      mockCount.mockResolvedValue(3 as never);

      await FeaturedArtistRepository.count({ published: true });

      expect(mockCount).toHaveBeenCalledWith({ where: { publishedOn: { not: null } } });
    });
  });

  describe('findById', () => {
    it('should find a unique record by id with include', async () => {
      mockFindUnique.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.findById('fa-1');

      expect(result).toEqual(mockFeaturedArtist);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        include: featuredArtistInclude,
      });
    });

    it('should return null when not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await FeaturedArtistRepository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update by id with the given data and include', async () => {
      const updated = { ...mockFeaturedArtist, displayName: 'Updated' };
      mockUpdate.mockResolvedValue(updated as never);

      const result = await FeaturedArtistRepository.update('fa-1', { displayName: 'Updated' });

      expect(result).toEqual(updated);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        data: { displayName: 'Updated' },
        include: featuredArtistInclude,
      });
    });
  });

  describe('updateCoverArt', () => {
    it('updates only the coverArt field (no relations re-hydrated)', async () => {
      mockUpdate.mockResolvedValue(mockFeaturedArtist as never);

      await FeaturedArtistRepository.updateCoverArt('fa-1', 'https://cdn/x.webp');

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        data: { coverArt: 'https://cdn/x.webp' },
      });
    });
  });

  describe('delete', () => {
    it('should delete by id with include', async () => {
      mockDelete.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.delete('fa-1');

      expect(result).toEqual(mockFeaturedArtist);
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        include: featuredArtistInclude,
      });
    });
  });
});
