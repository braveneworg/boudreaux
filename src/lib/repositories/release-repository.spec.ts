/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';
import type { CreateReleaseData } from '@/lib/types/domain/release';

import { ReleaseRepository } from './release-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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

describe('ReleaseRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockRelease = { id: 'release-123', title: 'Test Album' };

  // Detail include with unordered images (create/softDelete/restore/update).
  const detailIncludeUnordered = {
    images: true,
    artistReleases: { include: { artist: true } },
    digitalFormats: { include: { files: true } },
    releaseUrls: { include: { url: true } },
  };

  // Detail include with sortOrder-ordered images and trackNumber-ordered files
  // (findById).
  const detailIncludeOrdered = {
    images: { orderBy: { sortOrder: 'asc' } },
    artistReleases: { include: { artist: true } },
    digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
    releaseUrls: { include: { url: true } },
  };

  const listItemInclude = {
    images: { orderBy: { sortOrder: 'asc' }, take: 3 },
    artistReleases: { include: { artist: true } },
  };

  const listingSelect = {
    id: true,
    title: true,
    coverArt: true,
    releasedOn: true,
    images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { src: true, altText: true } },
    artistReleases: {
      select: {
        artist: { select: { id: true, firstName: true, surname: true, displayName: true } },
      },
    },
    releaseUrls: { select: { url: { select: { platform: true, url: true } } } },
  };

  const detailSelect = {
    images: { orderBy: { sortOrder: 'asc' } },
    artistReleases: {
      select: {
        artist: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            surname: true,
            displayName: true,
            title: true,
            suffix: true,
          },
        },
      },
    },
    digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
    releaseUrls: { include: { url: true } },
  };

  const createData: CreateReleaseData = {
    title: 'Test Album',
    releasedOn: new Date('2024-01-15'),
    coverArt: 'https://example.com/cover.jpg',
    formats: ['DIGITAL'],
  };

  describe('create', () => {
    it('creates a release with the unordered-images detail include', async () => {
      vi.mocked(prisma.release.create).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.create(createData);

      expect(result).toEqual(mockRelease);
      expect(prisma.release.create).toHaveBeenCalledWith({
        data: createData,
        include: detailIncludeUnordered,
      });
    });
  });

  describe('findById', () => {
    it('finds a release with ordered images and the full detail include', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.findById('release-123');

      expect(result).toEqual(mockRelease);
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        include: detailIncludeOrdered,
      });
    });

    it('returns null when the release is not found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(null);

      const result = await ReleaseRepository.findById('missing');

      expect(result).toBeNull();
    });

    it('wraps a Prisma not-found error as a DataError with code NOT_FOUND', async () => {
      vi.mocked(prisma.release.findUnique).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' })
      );

      await expect(ReleaseRepository.findById('a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.release.findUnique).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(ReleaseRepository.findById('a')).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('findMany', () => {
    it('uses the listing include, default pagination, and createdAt desc order', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockRelease] as never);

      const result = await ReleaseRepository.findMany({});

      expect(result).toEqual([mockRelease]);
      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.skip).toBe(0);
      expect(arg?.take).toBe(50);
      expect(arg?.orderBy).toEqual({ createdAt: 'desc' });
      expect(arg?.include).toEqual(listItemInclude);
    });

    it('excludes soft-deleted releases by default (Mongo null-safe)', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({});

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
      });
    });

    it('includes soft-deleted releases when deleted=true', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({});
    });

    it('filters to published releases when published=true', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, published: true });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [{ publishedAt: { not: null } }] });
    });

    it('filters to unpublished releases when published=false', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, published: false });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [{ OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] }],
      });
    });

    it('adds a case-insensitive search OR across title/catalog/description', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, search: 'foo' });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [
          {
            OR: [
              { title: { contains: 'foo', mode: 'insensitive' } },
              { catalogNumber: { contains: 'foo', mode: 'insensitive' } },
              { description: { contains: 'foo', mode: 'insensitive' } },
            ],
          },
        ],
      });
    });

    it('filters by artistIds when provided', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, artistIds: ['artist-1', 'artist-2'] });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        artistReleases: { some: { artistId: { in: ['artist-1', 'artist-2'] } } },
      });
    });

    it('does NOT filter by artistIds when an empty array is provided', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, artistIds: [] });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0] ?? {};
      expect(arg.where).not.toHaveProperty('artistReleases');
    });

    it('honors custom pagination', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ skip: 10, take: 5 });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.skip).toBe(10);
      expect(arg?.take).toBe(5);
    });
  });

  describe('count', () => {
    it('counts all releases with no filter', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(7 as never);

      const result = await ReleaseRepository.count();

      expect(result).toBe(7);
      expect(prisma.release.count).toHaveBeenCalledWith({ where: {} });
    });

    it('counts only published releases when published=true', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(3 as never);

      await ReleaseRepository.count({ published: true });

      expect(prisma.release.count).toHaveBeenCalledWith({ where: { publishedAt: { not: null } } });
    });

    it('counts only unpublished releases when published=false', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(4 as never);

      await ReleaseRepository.count({ published: false });

      expect(prisma.release.count).toHaveBeenCalledWith({
        where: { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] },
      });
    });
  });

  describe('update', () => {
    it('updates with the unordered-images detail include', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.update('release-123', { title: 'New' });

      expect(result).toEqual(mockRelease);
      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { title: 'New' },
        include: detailIncludeUnordered,
      });
    });
  });

  describe('updateData', () => {
    it('updates without re-hydrating relations', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      await ReleaseRepository.updateData('release-123', { deletedOn: null });

      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: null },
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedOn to a Date with the unordered-images detail include', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      await ReleaseRepository.softDelete('release-123');

      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: expect.any(Date) },
        include: detailIncludeUnordered,
      });
    });
  });

  describe('restore', () => {
    it('clears deletedOn with the unordered-images detail include', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      await ReleaseRepository.restore('release-123');

      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: null },
        include: detailIncludeUnordered,
      });
    });
  });

  describe('findForDeletion', () => {
    it('loads digital-format files and images for S3 cleanup', async () => {
      const existing = { id: 'release-123', digitalFormats: [], images: [] };
      vi.mocked(prisma.release.findUnique).mockResolvedValue(existing as never);

      const result = await ReleaseRepository.findForDeletion('release-123');

      expect(result).toEqual(existing);
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        include: {
          digitalFormats: { include: { files: true } },
          images: true,
        },
      });
    });
  });

  describe('delete', () => {
    it('hard-deletes the release by id', async () => {
      vi.mocked(prisma.release.delete).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.delete('release-123');

      expect(result).toEqual(mockRelease);
      expect(prisma.release.delete).toHaveBeenCalledWith({ where: { id: 'release-123' } });
    });
  });

  describe('cascade helpers', () => {
    it('deleteReleaseUrls deletes by releaseId', async () => {
      await ReleaseRepository.deleteReleaseUrls('release-123');

      expect(prisma.releaseUrl.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
    });

    it('deleteImages deletes by releaseId', async () => {
      await ReleaseRepository.deleteImages('release-123');

      expect(prisma.image.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
    });

    it('deleteArtistReleases deletes by releaseId', async () => {
      await ReleaseRepository.deleteArtistReleases('release-123');

      expect(prisma.artistRelease.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
      });
    });

    it('clearFeaturedArtistReferences nulls releaseId', async () => {
      await ReleaseRepository.clearFeaturedArtistReferences('release-123');

      expect(prisma.featuredArtist.updateMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
        data: { releaseId: null },
      });
    });
  });

  describe('findPublished', () => {
    it('uses the listing select, releasedOn desc, pagination, and a published+non-deleted where', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublished({ skip: 24, take: 12 });

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          publishedAt: { not: null },
          AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
        },
        orderBy: { releasedOn: 'desc' },
        skip: 24,
        take: 12,
        select: listingSelect,
      });
    });

    it('adds a server-side search OR across title/catalog/description/artist', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublished({ search: 'Doe' });

      const contains = { contains: 'Doe', mode: 'insensitive' };
      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        publishedAt: { not: null },
        AND: [
          { OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] },
          {
            OR: [
              { title: contains },
              { catalogNumber: contains },
              { description: contains },
              {
                artistReleases: {
                  some: {
                    artist: {
                      OR: [
                        { firstName: contains },
                        { surname: contains },
                        { displayName: contains },
                      ],
                    },
                  },
                },
              },
            ],
          },
        ],
      });
    });
  });

  describe('findPublishedWithTracks', () => {
    it('filters by id, publishedAt, deletedOn null/unset and uses the detail include', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.findPublishedWithTracks('release-123');

      expect(result).toEqual(mockRelease);
      expect(prisma.release.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'release-123',
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        include: detailSelect,
      });
    });
  });

  describe('findPublishedByArtistExcluding', () => {
    it('filters by artist, excludes the current release, published-only, single image', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublishedByArtistExcluding('artist-1', 'release-123');

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          artistReleases: { some: { artistId: 'artist-1' } },
          id: { not: 'release-123' },
          publishedAt: { not: null },
          OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
        },
        orderBy: { releasedOn: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      });
    });
  });

  describe('findByTitleInsensitive', () => {
    it('queries case-insensitively and projects id/title/publishedAt/deletedOn', async () => {
      const found = { id: 'r-1', title: 'Test', publishedAt: null, deletedOn: null };
      vi.mocked(prisma.release.findFirst).mockResolvedValue(found as never);

      const result = await ReleaseRepository.findByTitleInsensitive('test');

      expect(result).toEqual(found);
      expect(prisma.release.findFirst).toHaveBeenCalledWith({
        where: { title: { equals: 'test', mode: 'insensitive' } },
        select: { id: true, title: true, publishedAt: true, deletedOn: true },
      });
    });
  });

  describe('findPublishedTitleById', () => {
    it('queries a published release projecting id/title', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue({ id: 'r-1', title: 'T' } as never);

      const result = await ReleaseRepository.findPublishedTitleById('r-1');

      expect(result).toEqual({ id: 'r-1', title: 'T' });
      expect(prisma.release.findFirst).toHaveBeenCalledWith({
        where: { id: 'r-1', publishedAt: { not: null } },
        select: { id: true, title: true },
      });
    });
  });

  describe('findTitleById', () => {
    it('queries regardless of publish state projecting id/title', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ id: 'r-1', title: 'T' } as never);

      const result = await ReleaseRepository.findTitleById('r-1');

      expect(result).toEqual({ id: 'r-1', title: 'T' });
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'r-1' },
        select: { id: true, title: true },
      });
    });
  });

  describe('existsById', () => {
    it('returns true when a row is found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue({ id: 'r-1' } as never);

      const result = await ReleaseRepository.existsById('r-1');

      expect(result).toBe(true);
    });

    it('returns false when no row is found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(null);

      const result = await ReleaseRepository.existsById('missing');

      expect(result).toBe(false);
    });
  });
});
