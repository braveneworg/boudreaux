/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import { DataError } from '@/lib/types/domain/errors';

import { ArtistRepository } from './artist-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artist: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artistRelease: {
      upsert: vi.fn(),
    },
    artistBioLink: {
      delete: vi.fn(),
    },
    artistBioImage: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

const adminInclude = {
  images: { orderBy: { sortOrder: 'asc' }, take: 3 },
  labels: true,
  urls: true,
  releases: { include: { release: true } },
};

const nameSelect = { id: true, displayName: true, firstName: true, surname: true };

describe('ArtistRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('translates scalar data and includes the admin payload', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue({ id: 'a' } as never);

      const data = { firstName: 'John', surname: 'Doe', displayName: 'John Doe', slug: 'john-doe' };
      const result = await ArtistRepository.create(data);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.create).toHaveBeenCalledWith({ data, include: adminInclude });
    });

    it('builds connectOrCreate for nested images and urls', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.create({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        images: [{ id: 'i1', src: 's1' }],
        urls: [{ id: 'u1', platform: 'SPOTIFY', url: 'https://x' }],
      });

      const arg = vi.mocked(prisma.artist.create).mock.calls[0][0];
      expect(arg?.data?.images).toEqual({
        connectOrCreate: [
          {
            where: { id: 'i1' },
            create: { id: 'i1', src: 's1', altText: undefined, caption: undefined },
          },
        ],
      });
      expect(arg?.data?.urls).toEqual({
        connectOrCreate: [
          { where: { id: 'u1' }, create: { id: 'u1', platform: 'SPOTIFY', url: 'https://x' } },
        ],
      });
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

    it('wraps a Prisma error as a DataError', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: '6' })
      );

      await expect(ArtistRepository.findById('a')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(ArtistRepository.findById('a')).rejects.toBeInstanceOf(DataError);
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
    it('uses the full admin include and default pagination', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const result = await ArtistRepository.findMany({});

      expect(result).toEqual([{ id: 'a' }]);
      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.skip).toBe(0);
      expect(arg?.take).toBe(50);
      expect(arg?.orderBy).toEqual({ createdAt: 'desc' });
      expect(arg?.include).toEqual(adminInclude);
    });

    it('excludes soft-deleted artists by default (Mongo null-safe)', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({});

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
      });
    });

    it('includes soft-deleted artists when deleted=true', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({});
    });

    it('filters to published artists when published=true', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true, published: true });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({ AND: [{ publishedOn: { not: null } }] });
    });

    it('filters to unpublished artists when published=false', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true, published: false });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        AND: [{ OR: [{ publishedOn: null }, { publishedOn: { isSet: false } }] }],
      });
    });

    it('adds a case-insensitive search OR across name fields', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true, search: 'foo' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        AND: [
          {
            OR: [
              { firstName: { contains: 'foo', mode: 'insensitive' } },
              { surname: { contains: 'foo', mode: 'insensitive' } },
              { displayName: { contains: 'foo', mode: 'insensitive' } },
              { slug: { contains: 'foo', mode: 'insensitive' } },
            ],
          },
        ],
      });
    });
  });

  describe('count', () => {
    it('counts all artists with no filter', async () => {
      vi.mocked(prisma.artist.count).mockResolvedValue(7 as never);

      const result = await ArtistRepository.count();

      expect(result).toBe(7);
      expect(prisma.artist.count).toHaveBeenCalledWith({ where: {} });
    });

    it('counts only published artists when published=true', async () => {
      vi.mocked(prisma.artist.count).mockResolvedValue(3 as never);

      await ArtistRepository.count({ published: true });

      expect(prisma.artist.count).toHaveBeenCalledWith({ where: { publishedOn: { not: null } } });
    });
  });

  describe('update', () => {
    it('updates an artist by id and includes the admin payload', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.update('a', { displayName: 'New' });

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { displayName: 'New' },
        include: adminInclude,
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
    it('builds the public-search where with the lightweight include', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([{ id: 'a' }] as never);

      const result = await ArtistRepository.searchPublished({ skip: 0, take: 50 });

      expect(result).toEqual([{ id: 'a' }]);
      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        isActive: true,
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        releases: {
          some: {
            release: {
              publishedAt: { not: null },
              OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
            },
          },
        },
      });
      expect(arg?.orderBy).toEqual({ displayName: 'asc' });
      expect(arg?.include?.images).toEqual({ orderBy: { sortOrder: 'asc' }, take: 1 });
    });

    it('adds a title/name search AND clause when a search term is given', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.searchPublished({ search: 'foo' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where?.AND).toBeDefined();
    });
  });

  describe('findPublishedBySlugWithReleases', () => {
    it('finds a published, non-deleted artist by slug with the detail include', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findPublishedBySlugWithReleases('john-doe');

      expect(result).toEqual({ id: 'a' });
      const arg = vi.mocked(prisma.artist.findFirst).mock.calls[0][0];
      expect(arg?.where).toEqual({
        slug: 'john-doe',
        isActive: true,
        OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
      });
      expect(arg?.include?.releases).toBeDefined();
      expect(arg?.include?.bioImages).toBeDefined();
    });
  });

  describe('findUniqueBySlug', () => {
    it('finds an artist by slug with the name projection', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findUniqueBySlug('ceschi');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { slug: 'ceschi' },
        select: nameSelect,
      });
    });
  });

  describe('findFirstByDisplayName', () => {
    it('does a case-insensitive displayName lookup with the name projection', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findFirstByDisplayName('Ceschi');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: { displayName: { equals: 'Ceschi', mode: 'insensitive' } },
        select: nameSelect,
      });
    });
  });

  describe('findFirstByName', () => {
    it('does a case-insensitive firstName+surname lookup with the name projection', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findFirstByName('Ceschi', 'Ramos');

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { firstName: { equals: 'Ceschi', mode: 'insensitive' } },
            { surname: { equals: 'Ramos', mode: 'insensitive' } },
          ],
        },
        select: nameSelect,
      });
    });
  });

  describe('createWithSelect', () => {
    it('creates an artist returning only the name projection', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue({ id: 'a' } as never);

      const data = {
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane',
        isActive: true,
      };
      const result = await ArtistRepository.createWithSelect(data);

      expect(result).toEqual({ id: 'a' });
      expect(prisma.artist.create).toHaveBeenCalledWith({ data, select: nameSelect });
    });
  });

  describe('findBioImagesForRehost', () => {
    it('selects the rehost projection filtered by artistId', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([{ id: 'img-1' }] as never);

      const result = await ArtistRepository.findBioImagesForRehost('a1');

      expect(result).toEqual([{ id: 'img-1' }]);
      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        select: { id: true, url: true, thumbnailUrl: true, originalUrl: true },
      });
    });
  });

  describe('updateBioImageUrl', () => {
    it('updates the image row url by id', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistRepository.updateBioImageUrl('img-1', 'https://cdn.example/new.webp');

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { url: 'https://cdn.example/new.webp' },
      });
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

  describe('setBioStatus', () => {
    it('updates only the status when no options are given', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioStatus('a1', 'processing');

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioStatus: 'processing' },
      });
    });

    it('writes the error and startedAt when provided', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);
      const startedAt = new Date('2026-06-20T00:00:00Z');

      await ArtistRepository.setBioStatus('a1', 'pending', { error: null, startedAt });

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioStatus: 'pending', bioError: null, bioStartedAt: startedAt },
      });
    });
  });

  describe('getBioGenerationState', () => {
    it('selects the status fields plus ordered images and links', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      const result = await ArtistRepository.getBioGenerationState('a1');

      expect(result).toEqual({ bioStatus: 'succeeded' });
      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.where).toEqual({ id: 'a1' });
      expect(arg?.select?.altBio).toBe(true);
      expect(arg?.select?.bioImages).toMatchObject({ orderBy: { sortOrder: 'asc' } });
      expect(arg?.select?.bioLinks).toMatchObject({ orderBy: { sortOrder: 'asc' } });
    });

    it('includes id in the bioImages and bioLinks selects', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a2');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { id: true } });
      expect(arg?.select?.bioLinks).toMatchObject({ select: { id: true } });
    });
  });

  describe('deleteBioLink', () => {
    it('deletes the link row by id', async () => {
      await ArtistRepository.deleteBioLink('link-1');
      expect(prisma.artistBioLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    });
  });

  describe('deleteBioImage', () => {
    it('deletes the image row and returns its urls for cleanup', async () => {
      vi.mocked(prisma.artistBioImage.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
        thumbnailUrl: null,
      } as never);
      const removed = await ArtistRepository.deleteBioImage('img-1');
      expect(removed.url).toBe('https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp');
    });

    it('includes thumbnailUrl in the return contract', async () => {
      vi.mocked(prisma.artistBioImage.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/img/0-abc.webp',
        thumbnailUrl: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      } as never);
      const removed = await ArtistRepository.deleteBioImage('img-1');
      expect(removed.thumbnailUrl).toBe(
        'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp'
      );
    });
  });
});
