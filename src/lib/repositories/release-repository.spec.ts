/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';
import { CreditDecisionError } from '@/lib/types/domain/errors';
import type { CreateReleaseData } from '@/lib/types/domain/release';

import { publicArtistWhere } from './_internal/artist-where';
import { creditOrderBy } from './_internal/credit-order';
import { playableFormatWhere } from './_internal/playable-formats';
import { releasePublishedFilter, releaseWhere } from './_internal/release-where';
import { ReleaseRepository } from './release-repository';

vi.mock('server-only', () => ({}));

// A transaction gets its own client, separate from the mocked `prisma`, so a
// write that escapes the transaction shows up as a call on the outer client.
const tx = vi.hoisted(() => ({
  release: {
    create: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  artist: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  artistRelease: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
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
    artist: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    artistRelease: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
    featuredArtist: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

describe('ReleaseRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockRelease = { id: 'release-123', title: 'Test Album' };

  // Detail include with unordered images (writes, softDelete, restore).
  const detailIncludeUnordered = {
    images: true,
    artistReleases: { orderBy: creditOrderBy, include: { artist: true } },
    digitalFormats: { include: { files: true } },
    releaseUrls: { include: { url: true } },
  };

  // Detail include with sortOrder-ordered images and trackNumber-ordered files
  // (findById).
  const detailIncludeOrdered = {
    images: { orderBy: { sortOrder: 'asc' } },
    artistReleases: { orderBy: creditOrderBy, include: { artist: true } },
    digitalFormats: { include: { files: { orderBy: { trackNumber: 'asc' } } } },
    releaseUrls: { include: { url: true } },
  };

  const listItemInclude = {
    images: { orderBy: { sortOrder: 'asc' }, take: 3 },
    artistReleases: { orderBy: creditOrderBy, include: { artist: true } },
  };

  // Public reads load the full credit order with each artist's gate fields;
  // the service applies the byline rule (ADR-0015).

  const listingSelect = {
    id: true,
    title: true,
    coverArt: true,
    releasedOn: true,
    description: true,
    formats: true,
    catalogNumber: true,
    images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { src: true, altText: true } },
    artistReleases: {
      orderBy: creditOrderBy,
      select: {
        artist: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            displayName: true,
            slug: true,
            publishedOn: true,
            deletedOn: true,
          },
        },
      },
    },
    releaseUrls: { select: { url: { select: { platform: true, url: true } } } },
    // Public: only the active playable format (`playable-formats.ts`).
    digitalFormats: {
      where: playableFormatWhere,
      select: {
        files: { orderBy: { trackNumber: 'asc' }, take: 1, select: { s3Key: true } },
      },
    },
  };

  const detailSelect = {
    images: { orderBy: { sortOrder: 'asc' } },
    artistReleases: {
      orderBy: creditOrderBy,
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
            publishedOn: true,
            deletedOn: true,
          },
        },
      },
    },
    // Public: only the active playable format — never a paid or withdrawn one.
    digitalFormats: {
      where: playableFormatWhere,
      include: { files: { orderBy: { trackNumber: 'asc' } } },
    },
    releaseUrls: { include: { url: true } },
  };

  const createData: CreateReleaseData = {
    title: 'Test Album',
    releasedOn: new Date('2024-01-15'),
    coverArt: 'https://example.com/cover.jpg',
    formats: ['DIGITAL'],
  };

  /** Every call the outer client saw: a transaction write must leave this empty. */
  const outerWrites = (): unknown[] => [
    ...vi.mocked(prisma.release.create).mock.calls,
    ...vi.mocked(prisma.release.update).mock.calls,
    ...vi.mocked(prisma.artist.updateMany).mock.calls,
    ...vi.mocked(prisma.artistRelease.createMany).mock.calls,
    ...vi.mocked(prisma.artistRelease.deleteMany).mock.calls,
    ...vi.mocked(prisma.artistRelease.upsert).mock.calls,
  ];

  const awaitingRow = (id: string) => ({
    id,
    slug: id,
    displayName: id,
    firstName: null,
    middleName: null,
    surname: null,
    title: null,
    suffix: null,
    bio: null,
    shortBio: null,
    altBio: null,
    bioGeneratedAt: null,
    // A chosen display image: a credit decision publishes only such an artist (ADR-0019).
    bioImages: [{ isPrimary: false, displayOrder: 0, alt: 'portrait' }],
  });

  describe('transaction writes', () => {
    const NOW = new Date('2026-10-04T12:00:00.000Z');

    beforeEach(() => {
      tx.release.create.mockResolvedValue({ id: 'release-123' });
      tx.release.update.mockResolvedValue({ id: 'release-123' });
      tx.release.findUniqueOrThrow.mockResolvedValue(mockRelease);
      tx.artist.findMany.mockResolvedValue([]);
      tx.artist.updateMany.mockResolvedValue({ count: 0 });
      tx.artistRelease.findMany.mockResolvedValue([]);
      tx.artistRelease.createMany.mockResolvedValue({ count: 0 });
      tx.artistRelease.deleteMany.mockResolvedValue({ count: 0 });
      tx.artistRelease.upsert.mockResolvedValue({});
    });

    describe('createWithCredits', () => {
      it('creates the release and its credits in one transaction', async () => {
        await ReleaseRepository.createWithCredits(createData, ['artist-b', 'artist-a']);

        expect({
          transactions: vi.mocked(prisma.$transaction).mock.calls.length,
          created: tx.release.create.mock.calls,
          credited: tx.artistRelease.createMany.mock.calls,
          outer: outerWrites(),
        }).toEqual({
          transactions: 1,
          created: [[{ data: createData, select: { id: true } }]],
          credited: [
            [
              {
                data: [
                  { artistId: 'artist-b', releaseId: 'release-123', position: 0 },
                  { artistId: 'artist-a', releaseId: 'release-123', position: 1 },
                ],
              },
            ],
          ],
          outer: [],
        });
      });

      it('returns the release as the transaction left it, with the detail include', async () => {
        const result = await ReleaseRepository.createWithCredits(createData, []);

        expect({ result, read: tx.release.findUniqueOrThrow.mock.calls }).toEqual({
          result: mockRelease,
          read: [[{ where: { id: 'release-123' }, include: detailIncludeUnordered }]],
        });
      });
    });

    describe('updateWithCredits', () => {
      const publish = {
        decisions: { publishArtistIds: ['artist-1'], keepHiddenArtistIds: [] },
        publishedBy: 'admin-1',
        now: NOW,
      };

      it('writes the release, its credits and its artists in one transaction', async () => {
        tx.artist.findMany.mockResolvedValueOnce([awaitingRow('artist-1')]);

        await ReleaseRepository.updateWithCredits(
          'release-123',
          { title: 'New', publishedAt: NOW },
          { artistIds: ['artist-1'], publish }
        );

        expect({
          transactions: vi.mocked(prisma.$transaction).mock.calls.length,
          updated: tx.release.update.mock.calls,
          credited: tx.artistRelease.upsert.mock.calls.length,
          published: tx.artist.updateMany.mock.calls.length,
          outer: outerWrites(),
        }).toEqual({
          transactions: 1,
          updated: [
            [
              {
                where: { id: 'release-123' },
                data: { title: 'New', publishedAt: NOW },
                select: { id: true },
              },
            ],
          ],
          credited: 1,
          published: 1,
          outer: [],
        });
      });

      it('leaves the stored credits alone when the write lists none', async () => {
        await ReleaseRepository.updateWithCredits('release-123', { title: 'New' }, {});

        expect({
          read: tx.artistRelease.findMany.mock.calls,
          upserted: tx.artistRelease.upsert.mock.calls,
        }).toEqual({ read: [], upserted: [] });
      });

      it('checks and publishes no artist when the write does not publish', async () => {
        await ReleaseRepository.updateWithCredits(
          'release-123',
          { title: 'New' },
          { artistIds: ['artist-1'] }
        );

        expect({
          checked: tx.artist.findMany.mock.calls,
          published: tx.artist.updateMany.mock.calls,
        }).toEqual({ checked: [], published: [] });
      });

      it('fails, without a read-back, when a credit is undecided', async () => {
        tx.artist.findMany.mockResolvedValueOnce([awaitingRow('artist-9')]);

        await expect(
          ReleaseRepository.updateWithCredits(
            'release-123',
            { publishedAt: NOW },
            {
              publish: { ...publish, decisions: { publishArtistIds: [], keepHiddenArtistIds: [] } },
            }
          )
        ).rejects.toBeInstanceOf(CreditDecisionError);
        expect(tx.release.findUniqueOrThrow.mock.calls).toEqual([]);
      });

      it('returns the release as the transaction left it, with the detail include', async () => {
        const result = await ReleaseRepository.updateWithCredits(
          'release-123',
          { title: 'New' },
          {}
        );

        expect({ result, read: tx.release.findUniqueOrThrow.mock.calls }).toEqual({
          result: mockRelease,
          read: [[{ where: { id: 'release-123' }, include: detailIncludeUnordered }]],
        });
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

    it('restricts the listing to the given ids', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ ids: ['r1', 'r2'] });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [releaseWhere.notDeleted, { id: { in: ['r1', 'r2'] } }],
      });
    });

    it('matches nothing for an empty id list', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ ids: [] });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [releaseWhere.notDeleted, { id: { in: [] } }] });
    });

    it('excludes soft-deleted releases by default (Mongo null-safe)', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({});

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [releaseWhere.notDeleted] });
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
      expect(arg?.where).toEqual({ AND: [releasePublishedFilter(true)] });
    });

    it('filters to unpublished releases when published=false', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findMany({ deleted: true, published: false });

      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [releaseWhere.unpublished] });
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

  describe('findIdsWithoutByline', () => {
    const head = (id: string, artist?: { publishedOn: Date | null; deletedOn: Date | null }) => ({
      id,
      artistReleases: artist ? [{ artist }] : [],
    });
    const PUBLISHED = new Date('2026-01-01');

    it("reads each listed release's first credit in stored order with its gate fields", async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValueOnce([] as never);

      await ReleaseRepository.findIdsWithoutByline();

      expect(vi.mocked(prisma.release.findMany).mock.calls).toEqual([
        [
          {
            where: releaseWhere.listed,
            select: {
              id: true,
              artistReleases: {
                orderBy: creditOrderBy,
                take: 1,
                select: { artist: { select: { publishedOn: true, deletedOn: true } } },
              },
            },
          },
        ],
      ]);
    });

    // The byline rule is the public one (publicCredits): a hidden first
    // credit, or no credit at all, leaves the byline empty.
    it('returns the releases whose album artist is hidden or missing', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValueOnce([
        head('public-lead', { publishedOn: PUBLISHED, deletedOn: null }),
        head('archived-lead', { publishedOn: PUBLISHED, deletedOn: PUBLISHED }),
        head('unpublished-lead', { publishedOn: null, deletedOn: null }),
        head('no-credits'),
      ] as never);

      const ids = await ReleaseRepository.findIdsWithoutByline();

      expect(ids).toEqual(['archived-lead', 'unpublished-lead', 'no-credits']);
    });
  });

  describe('count', () => {
    it('counts every release that is not deleted when no filter is given', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(7 as never);

      const result = await ReleaseRepository.count();

      expect(result).toBe(7);
      expect(prisma.release.count).toHaveBeenCalledWith({
        where: { AND: [releaseWhere.notDeleted] },
      });
    });

    it('counts only published releases when published=true', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(3 as never);

      await ReleaseRepository.count({ published: true });

      expect(prisma.release.count).toHaveBeenCalledWith({
        where: { AND: [releaseWhere.notDeleted, releasePublishedFilter(true)] },
      });
    });

    it('counts only unpublished releases when published=false', async () => {
      vi.mocked(prisma.release.count).mockResolvedValue(4 as never);

      await ReleaseRepository.count({ published: false });

      expect(prisma.release.count).toHaveBeenCalledWith({
        where: { AND: [releaseWhere.notDeleted, releaseWhere.unpublished] },
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
        where: releaseWhere.listed,
        orderBy: { releasedOn: 'desc' },
        skip: 24,
        take: 12,
        select: listingSelect,
      });
    });

    it('adds a server-side search OR across title/catalog/description/public artist', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublished({ search: 'Doe' });

      const contains = { contains: 'Doe', mode: 'insensitive' };
      const arg = vi.mocked(prisma.release.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        publishedAt: { not: null },
        AND: [
          releaseWhere.notDeleted,
          {
            OR: [
              { title: contains },
              { catalogNumber: contains },
              { description: contains },
              {
                artistReleases: {
                  some: {
                    artist: {
                      is: {
                        AND: [
                          publicArtistWhere,
                          {
                            OR: [
                              { firstName: contains },
                              { surname: contains },
                              { displayName: contains },
                            ],
                          },
                        ],
                      },
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
          ...releaseWhere.listed,
        },
        include: detailSelect,
      });
    });
  });

  describe('findPublishedByArtistExcluding', () => {
    it('filters by a public artist, excludes the current release, published-only, single image', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublishedByArtistExcluding('artist-1', 'release-123');

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          artistReleases: { some: { artistId: 'artist-1', artist: { is: publicArtistWhere } } },
          id: { not: 'release-123' },
          ...releaseWhere.listed,
        },
        orderBy: { releasedOn: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      });
    });
  });

  describe('findPublishedByArtist', () => {
    it('returns id and title of published releases for the artist, newest first', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([
        { id: 'r2', title: 'Second' },
        { id: 'r1', title: 'First' },
      ] as never);

      const result = await ReleaseRepository.findPublishedByArtist('artist-1');

      expect(result).toEqual([
        { id: 'r2', title: 'Second' },
        { id: 'r1', title: 'First' },
      ]);
    });

    it('queries with the correct where/select/orderBy shape', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublishedByArtist('artist-1');

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          artistReleases: { some: { artistId: 'artist-1' } },
          ...releaseWhere.listed,
        },
        orderBy: { releasedOn: 'desc' },
        select: { id: true, title: true },
      });
    });
  });

  describe('findPublishedByArtistWithCovers', () => {
    it('returns releases mapped to ReleaseCoverSource with the first image src as coverUrl', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([
        {
          id: 'r1',
          title: 'Test Album',
          releasedOn: new Date('2020-05-01T00:00:00Z'),
          images: [{ src: 'https://cdn.example.com/cover.jpg' }],
        },
      ] as never);

      const result = await ReleaseRepository.findPublishedByArtistWithCovers('artist-1');

      expect(result).toEqual([
        {
          id: 'r1',
          title: 'Test Album',
          releasedOn: new Date('2020-05-01T00:00:00Z'),
          coverUrl: 'https://cdn.example.com/cover.jpg',
        },
      ]);
    });

    it('maps coverUrl to null when no image exists', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([
        {
          id: 'r1',
          title: 'No Cover',
          releasedOn: new Date('2021-01-01T00:00:00Z'),
          images: [],
        },
      ] as never);

      const result = await ReleaseRepository.findPublishedByArtistWithCovers('artist-1');

      expect(result).toEqual([
        {
          id: 'r1',
          title: 'No Cover',
          releasedOn: new Date('2021-01-01T00:00:00Z'),
          coverUrl: null,
        },
      ]);
    });

    it('queries with the correct where/select/orderBy shape', async () => {
      vi.mocked(prisma.release.findMany).mockResolvedValue([] as never);

      await ReleaseRepository.findPublishedByArtistWithCovers('artist-1');

      expect(prisma.release.findMany).toHaveBeenCalledWith({
        where: {
          artistReleases: { some: { artistId: 'artist-1' } },
          ...releaseWhere.listed,
        },
        orderBy: { releasedOn: 'desc' },
        select: {
          id: true,
          title: true,
          releasedOn: true,
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { src: true },
          },
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
    it('queries a listed (published, not deleted) release projecting id/title', async () => {
      vi.mocked(prisma.release.findFirst).mockResolvedValue({ id: 'r-1', title: 'T' } as never);

      const result = await ReleaseRepository.findPublishedTitleById('r-1');

      expect(result).toEqual({ id: 'r-1', title: 'T' });
      expect(prisma.release.findFirst).toHaveBeenCalledWith({
        where: { id: 'r-1', ...releaseWhere.listed },
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
