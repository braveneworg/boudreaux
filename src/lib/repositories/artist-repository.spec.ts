/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { artistWithPublishedReleasesInclude } from '@/lib/types/media-models';

import { ArtistRepository } from './artist-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artist: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artistRelease: {
      upsert: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ArtistRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('passes data through to prisma.artist.create', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue({ id: 'a' } as never);

      const data = { firstName: 'John', surname: 'Doe', displayName: 'John Doe', slug: 'john-doe' };
      const result = await ArtistRepository.create(data);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findById', () => {
    it('finds an artist by id including images ordered by sortOrder', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findById('a');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { id: 'a' },
        include: { images: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  });

  describe('findBySlug', () => {
    it('finds an artist by slug', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findBySlug('john-doe');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({ where: { slug: 'john-doe' } });
    });
  });

  describe('findMany', () => {
    it('forwards where/skip/take and uses the full admin include', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const where = { AND: [{ OR: [{ deletedOn: null }] }] };
      const result = await ArtistRepository.findMany({ where, skip: 5, take: 10 });

      expect(result).toEqual([{ id: 'a' }]);
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where,
        skip: 5,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 3 },
          labels: true,
          urls: true,
          releases: { include: { release: true } },
        },
      });
    });
  });

  describe('update', () => {
    it('updates an artist by id', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.update('a', { displayName: 'New' });

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { displayName: 'New' },
      });
    });
  });

  describe('delete', () => {
    it('deletes an artist by id', async () => {
      vi.mocked(prisma.artist.delete).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.delete('a');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
    });
  });

  describe('archive', () => {
    it('soft-deletes an artist by setting deletedOn', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.archive('a');

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { deletedOn: expect.any(Date) },
      });
    });
  });

  describe('existsById', () => {
    it('selects only the id for an existence check', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.existsById('a');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { id: 'a' },
        select: { id: true },
      });
    });
  });

  describe('searchPublished', () => {
    it('forwards where/skip/take with the public search include', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const where = { isActive: true };
      const result = await ArtistRepository.searchPublished({ where, skip: 0, take: 50 });

      expect(result).toEqual([{ id: 'a' }]);
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where,
        skip: 0,
        take: 50,
        orderBy: { displayName: 'asc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          releases: {
            include: {
              release: { select: { id: true, title: true, publishedAt: true, deletedOn: true } },
            },
          },
        },
      });
    });
  });

  describe('findBySlugWithReleases', () => {
    it('finds the published-artist record by where using the shared include', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const where = { slug: 'john-doe', isActive: true };
      const result = await ArtistRepository.findBySlugWithReleases(where);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where,
        include: artistWithPublishedReleasesInclude,
      });
    });
  });

  describe('findUniqueBySlug', () => {
    it('finds an artist by slug with a select projection', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const select = { id: true, displayName: true, firstName: true, surname: true } as const;
      const result = await ArtistRepository.findUniqueBySlug('ceschi', select);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({ where: { slug: 'ceschi' }, select });
    });
  });

  describe('findFirstByDisplayName', () => {
    it('does a case-insensitive displayName lookup with a select projection', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const select = { id: true, displayName: true, firstName: true, surname: true } as const;
      const result = await ArtistRepository.findFirstByDisplayName('Ceschi', select);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: { displayName: { equals: 'Ceschi', mode: 'insensitive' } },
        select,
      });
    });
  });

  describe('findFirstByName', () => {
    it('does a case-insensitive firstName+surname lookup with a select projection', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const select = { id: true, displayName: true, firstName: true, surname: true } as const;
      const result = await ArtistRepository.findFirstByName('Ceschi', 'Ramos', select);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { firstName: { equals: 'Ceschi', mode: 'insensitive' } },
            { surname: { equals: 'Ramos', mode: 'insensitive' } },
          ],
        },
        select,
      });
    });
  });

  describe('createWithSelect', () => {
    it('creates an artist returning only the selected fields', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue({ id: 'a' } as never);

      const data = {
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane',
        isActive: true,
      };
      const select = { id: true, displayName: true, firstName: true, surname: true } as const;
      const result = await ArtistRepository.createWithSelect(data, select);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.create).toHaveBeenCalledWith({ data, select });
    });
  });

  describe('connectToRelease', () => {
    it('upserts an ArtistRelease join record', async () => {
      vi.mocked(prisma.artistRelease.upsert).mockResolvedValue({} as never);

      await ArtistRepository.connectToRelease('artist-1', 'release-1');

      expect(prisma.artistRelease.upsert).toHaveBeenCalledWith({
        where: { artistId_releaseId: { artistId: 'artist-1', releaseId: 'release-1' } },
        update: {},
        create: { artistId: 'artist-1', releaseId: 'release-1' },
      });
    });
  });
});
