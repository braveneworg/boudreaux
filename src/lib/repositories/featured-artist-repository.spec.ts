/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';

import { FeaturedArtistRepository, featuredArtistInclude } from './featured-artist-repository';

import type { Prisma } from '@prisma/client';

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

const mockCreate = vi.mocked(prisma.featuredArtist.create);
const mockFindMany = vi.mocked(prisma.featuredArtist.findMany);
const mockFindUnique = vi.mocked(prisma.featuredArtist.findUnique);
const mockUpdate = vi.mocked(prisma.featuredArtist.update);
const mockDelete = vi.mocked(prisma.featuredArtist.delete);

const mockFeaturedArtist = { id: 'fa-1', displayName: 'Test' };

describe('FeaturedArtistRepository', () => {
  describe('create', () => {
    it('should create with the full relation include', async () => {
      mockCreate.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.create({ displayName: 'Test' });

      expect(result).toBe(mockFeaturedArtist);
      expect(mockCreate).toHaveBeenCalledWith({
        data: { displayName: 'Test' },
        include: featuredArtistInclude,
      });
    });
  });

  describe('findFeatured', () => {
    it('should query with date filter, include, ordering and limit', async () => {
      const artists = [mockFeaturedArtist];
      mockFindMany.mockResolvedValue(artists as never);
      const currentDate = new Date('2024-07-01');

      const result = await FeaturedArtistRepository.findFeatured(currentDate, 5);

      expect(result).toBe(artists);
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
    it('should query with the provided where, pagination, ordering and include', async () => {
      const artists = [mockFeaturedArtist];
      mockFindMany.mockResolvedValue(artists as never);
      const where: Prisma.FeaturedArtistWhereInput = { AND: [{ publishedOn: { not: null } }] };

      const result = await FeaturedArtistRepository.findAll({ where, skip: 10, take: 20 });

      expect(result).toBe(artists);
      expect(mockFindMany).toHaveBeenCalledWith({
        where,
        skip: 10,
        take: 20,
        orderBy: [{ position: 'asc' }, { featuredOn: 'desc' }],
        include: featuredArtistInclude,
      });
    });
  });

  describe('findById', () => {
    it('should find a unique record by id with include', async () => {
      mockFindUnique.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.findById('fa-1');

      expect(result).toBe(mockFeaturedArtist);
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

      expect(result).toBe(updated);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        data: { displayName: 'Updated' },
        include: featuredArtistInclude,
      });
    });
  });

  describe('delete', () => {
    it('should delete by id with include', async () => {
      mockDelete.mockResolvedValue(mockFeaturedArtist as never);

      const result = await FeaturedArtistRepository.delete('fa-1');

      expect(result).toBe(mockFeaturedArtist);
      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'fa-1' },
        include: featuredArtistInclude,
      });
    });
  });
});
