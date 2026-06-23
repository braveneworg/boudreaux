/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ImageRepository } from './image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    image: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ImageRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findManyByOwner', () => {
    it('queries images by artistId owner with a select projection', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const result = await ImageRepository.findManyByOwner({ artistId: 'artist-1' });

      expect(result).toEqual([{ id: 'a' }]);
      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { artistId: 'artist-1' },
        select: { id: true },
      });
    });

    it('queries images by releaseId owner', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([] as never);

      await ImageRepository.findManyByOwner({ releaseId: 'release-1' });

      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-1' },
        select: { id: true },
      });
    });
  });

  describe('create', () => {
    it('passes the data straight through to prisma.image.create', async () => {
      const created = { id: 'img-1', src: 'x', sortOrder: 0 };
      vi.mocked(prisma.image.create).mockResolvedValue(created as never);

      const result = await ImageRepository.create({
        src: 'x',
        caption: 'cap',
        altText: 'alt',
        artistId: 'artist-1',
        sortOrder: 0,
      });

      expect(result).toBe(created);
      expect(prisma.image.create).toHaveBeenCalledWith({
        data: {
          src: 'x',
          caption: 'cap',
          altText: 'alt',
          artistId: 'artist-1',
          sortOrder: 0,
        },
      });
    });
  });

  describe('findUniqueById', () => {
    it('finds an image by id (all scalar fields)', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({ id: 'img-1' } as never);

      const result = await ImageRepository.findUniqueById('img-1');

      expect(result).toEqual({ id: 'img-1' });
      expect(prisma.image.findUnique).toHaveBeenCalledWith({ where: { id: 'img-1' } });
    });
  });

  describe('findManyByArtist', () => {
    it('queries all images for an artist ordered by sortOrder asc', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const result = await ImageRepository.findManyByArtist('artist-1');

      expect(result).toEqual([{ id: 'a' }]);
      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { artistId: 'artist-1' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findManyByArtistAndIds', () => {
    it('selects ids for the given artist scoped to the supplied image ids', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'a' }] as never);

      await ImageRepository.findManyByArtistAndIds('artist-1', ['a', 'b']);

      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { artistId: 'artist-1', id: { in: ['a', 'b'] } },
        select: { id: true },
      });
    });
  });

  describe('update', () => {
    it('updates an image by id with the supplied data', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({ id: 'img-1' } as never);

      const result = await ImageRepository.update('img-1', {
        caption: 'new',
        altText: 'alt',
      });

      expect(result).toEqual({ id: 'img-1' });
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { caption: 'new', altText: 'alt' },
      });
    });
  });

  describe('updateSortOrder', () => {
    it('updates a single image sortOrder', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      await ImageRepository.updateSortOrder('img-1', 2);

      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { sortOrder: 2 },
      });
    });
  });

  describe('delete', () => {
    it('deletes an image by id', async () => {
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'img-1' } as never);

      const result = await ImageRepository.delete('img-1');

      expect(result).toEqual({ id: 'img-1' });
      expect(prisma.image.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
    });
  });
});
