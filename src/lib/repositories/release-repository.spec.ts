/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';
import {
  publishedReleaseDetailInclude,
  publishedReleaseListingSelect,
} from '@/lib/types/media-models';

import { ReleaseRepository } from './release-repository';

import type { Prisma } from '@prisma/client';

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
  const mockRelease = { id: 'release-123', title: 'Test Album' };

  const detailIncludeNoImages = {
    artistReleases: { include: { artist: true } },
    digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
    releaseUrls: { include: { url: true } },
  };

  describe('create', () => {
    it('creates a release with the full detail include (images unbounded)', async () => {
      vi.mocked(prisma.release.create).mockResolvedValue(mockRelease as never);
      const data = { title: 'Test Album' } as Prisma.ReleaseCreateInput;

      const result = await ReleaseRepository.create(data);

      expect(result).toEqual(mockRelease);
      expect(prisma.release.create).toHaveBeenCalledWith({
        data,
        include: {
          artistReleases: { include: { artist: true } },
          digitalFormats: { include: { files: true } },
          releaseUrls: { include: { url: true } },
          images: true,
        },
      });
    });
  });

  describe('findById', () => {
    it('finds a release with unbounded images ordered by sortOrder and full detail include', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(mockRelease as never);

      const result = await ReleaseRepository.findById('release-123');

      expect(result).toEqual(mockRelease);
      expect(prisma.release.findUnique).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          ...detailIncludeNoImages,
        },
      });
    });

    it('returns null when the release is not found', async () => {
      vi.mocked(prisma.release.findUnique).mockResolvedValue(null);

      const result = await ReleaseRepository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findMany', () => {
    it('queries with the caller where, pagination, createdAt desc, and capped images', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([mockRelease] as never);
      const where = { AND: [{ title: 'x' }] } as Prisma.ReleaseWhereInput;

      const result = await ReleaseRepository.findMany({ where, skip: 10, take: 5 });

      expect(result).toEqual([mockRelease]);
      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where,
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 3 },
          ...detailIncludeNoImages,
        },
      });
    });
  });

  describe('update', () => {
    it('updates with the full detail include (images unbounded)', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);
      const data = { title: 'New' } as Prisma.ReleaseUpdateInput;

      const result = await ReleaseRepository.update('release-123', data);

      expect(result).toEqual(mockRelease);
      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data,
        include: {
          images: true,
          ...detailIncludeNoImages,
        },
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
    it('sets deletedOn to a Date with the unordered-files detail include', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      await ReleaseRepository.softDelete('release-123');

      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: expect.any(Date) },
        include: {
          images: true,
          artistReleases: { include: { artist: true } },
          digitalFormats: { include: { files: true } },
          releaseUrls: { include: { url: true } },
        },
      });
    });
  });

  describe('restore', () => {
    it('clears deletedOn with the unordered-files detail include', async () => {
      vi.mocked(prisma.release.update).mockResolvedValue(mockRelease as never);

      await ReleaseRepository.restore('release-123');

      expect(prisma.release.update).toHaveBeenCalledWith({
        where: { id: 'release-123' },
        data: { deletedOn: null },
        include: {
          images: true,
          artistReleases: { include: { artist: true } },
          digitalFormats: { include: { files: true } },
          releaseUrls: { include: { url: true } },
        },
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
    it('queries with the caller where, listing select, releasedOn desc, and pagination', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);
      const where = { publishedAt: { not: null } } as Prisma.ReleaseWhereInput;

      await ReleaseRepository.findPublished({ where, skip: 24, take: 12 });

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where,
        orderBy: { releasedOn: 'desc' },
        skip: 24,
        take: 12,
        select: publishedReleaseListingSelect,
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
        include: publishedReleaseDetailInclude,
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
