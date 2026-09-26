/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import type { AssertExact } from '@/lib/types/assert';
import { ARTIST_PRIVATE_FIELDS, type ArtistDetail } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';

import { ArtistRepository } from './artist-repository';

vi.mock('server-only', () => ({}));

// Type honesty (#661): findById fetches only `artistDetailInclude` (scalars +
// ordered images), so its non-null return must be exactly `ArtistDetail` — never
// the admin `Artist` with phantom `labels`/`urls`/`releases`. If the return type
// ever re-widens to `Artist`, this exact-match assertion fails `pnpm run
// typecheck`, catching any caller that would trust relations the query omits.
type FindByIdResult = NonNullable<Awaited<ReturnType<typeof ArtistRepository.findById>>>;
type _FindByIdIsArtistDetail = AssertExact<FindByIdResult, ArtistDetail>;
const _findByIdIsArtistDetail: _FindByIdIsArtistDetail = true;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    artist: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    artistRelease: {
      upsert: vi.fn(),
    },
    artistBioLink: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    artistBioImage: {
      delete: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
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
    it('finds an artist by slug with a select projection', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'a' } as never);

      const result = await ArtistRepository.findBySlug('john-doe');

      expect(result).toEqual({ id: 'a' });
      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg.where).toEqual({ slug: 'john-doe' });
      expect(arg.select).toEqual(expect.objectContaining({ id: true, slug: true, bio: true }));
    });

    it.each(ARTIST_PRIVATE_FIELDS)('never selects the private field %s', async (field) => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      await ArtistRepository.findBySlug('john-doe');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg.select).not.toHaveProperty(field);
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

      const contains = { contains: 'foo', mode: 'insensitive' };
      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        AND: [
          {
            OR: [
              { firstName: contains },
              { middleName: contains },
              { surname: contains },
              { displayName: contains },
              { title: contains },
              { suffix: contains },
              { slug: contains },
            ],
          },
        ],
      });
    });

    it('requires every word of a multi-word search to match some name field', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true, search: 'Dr. John Smith' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      const and = (arg?.where?.AND ?? []) as Array<{ OR: Array<{ firstName?: unknown }> }>;
      expect(and.map(({ OR }) => OR[0].firstName)).toEqual([
        { contains: 'Dr', mode: 'insensitive' },
        { contains: 'John', mode: 'insensitive' },
        { contains: 'Smith', mode: 'insensitive' },
      ]);
    });

    it('omits the search clause when the search holds nothing searchable', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findMany({ deleted: true, search: ' . - ' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({});
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
    const buildDeleteTx = () => ({
      artistMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistLabel: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistRelease: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistFeaturedArtist: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistUrl: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistBioImage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artistBioLink: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      videoArtist: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      image: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      url: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      artist: { delete: vi.fn().mockResolvedValue({ id: 'a' }) },
    });

    it('deletes an artist by id inside a single transaction', async () => {
      const tx = buildDeleteTx();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      const result = await ArtistRepository.delete('a');

      expect(result).toEqual({ id: 'a' });
      expect(tx.artist.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('deletes the join rows scoped to the artist first', async () => {
      const tx = buildDeleteTx();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.delete('a');

      const byArtist = { where: { artistId: 'a' } };
      expect(tx.artistLabel.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.artistRelease.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.artistFeaturedArtist.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.artistUrl.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.artistBioImage.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.artistBioLink.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.videoArtist.deleteMany).toHaveBeenCalledWith(byArtist);
    });

    it('deletes band-membership rows in both directions', async () => {
      const tx = buildDeleteTx();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.delete('a');

      expect(tx.artistMember.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ artistId: 'a' }, { memberId: 'a' }] },
      });
    });

    it('deletes artist-scoped gallery images and urls', async () => {
      const tx = buildDeleteTx();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.delete('a');

      const byArtist = { where: { artistId: 'a' } };
      expect(tx.image.deleteMany).toHaveBeenCalledWith(byArtist);
      expect(tx.url.deleteMany).toHaveBeenCalledWith(byArtist);
    });

    it('removes every related row before the artist row', async () => {
      const tx = buildDeleteTx();
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.delete('a');

      const artistOrder = tx.artist.delete.mock.invocationCallOrder[0];
      const relatedOrders = [
        tx.artistMember.deleteMany,
        tx.artistLabel.deleteMany,
        tx.artistRelease.deleteMany,
        tx.artistFeaturedArtist.deleteMany,
        tx.artistUrl.deleteMany,
        tx.artistBioImage.deleteMany,
        tx.artistBioLink.deleteMany,
        tx.videoArtist.deleteMany,
        tx.image.deleteMany,
        tx.url.deleteMany,
      ].map((mock) => mock.mock.invocationCallOrder[0]);
      expect(relatedOrders.map((order) => order < artistOrder)).toEqual(
        Array.from({ length: 10 }, () => true)
      );
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
      expect(arg?.include?.images).toEqual({ orderBy: { sortOrder: 'asc' }, take: 1 });
    });

    it('fetches every match instead of ordering and paging in the database', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.searchPublished({ skip: 10, take: 10 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty('skip');
      expect(arg).not.toHaveProperty('take');
      expect(arg).not.toHaveProperty('orderBy');
    });

    it('orders matches by displayed name, composing it when none is stored', async () => {
      const named = (id: string, displayName: string) => ({ id, displayName });
      const composed = {
        id: 'composed',
        displayName: null,
        title: 'Dr.',
        firstName: 'Quillon',
        middleName: null,
        surname: 'Tokensmith',
        suffix: null,
      };
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        named('e', 'Eve'),
        composed,
        named('c', 'cara'),
      ] as never);

      const result = await ArtistRepository.searchPublished({});

      expect(result.map(({ id }) => id)).toEqual(['c', 'composed', 'e']);
    });

    it('slices the ordered matches to the requested page', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        { id: 'c', displayName: 'Cara' },
        { id: 'a', displayName: 'Alice' },
        { id: 'b', displayName: 'Bob' },
      ] as never);

      const result = await ArtistRepository.searchPublished({ skip: 1, take: 1 });

      expect(result.map(({ id }) => id)).toEqual(['b']);
    });

    it('does not require the artist itself to be published (playlist search keeps its rule)', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.searchPublished({ search: 'foo' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).not.toHaveProperty('publishedOn');
    });

    it('adds a title/name search AND clause when a search term is given', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.searchPublished({ search: 'foo' });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where?.AND).toBeDefined();
    });
  });

  describe('listListed', () => {
    const notDeleted = [{ deletedOn: null }, { deletedOn: { isSet: false } }];
    const listedReleaseClause = {
      some: {
        release: {
          publishedAt: { not: null },
          OR: notDeleted,
        },
      },
    };
    const searchOr = (arg: { where?: { AND?: Array<{ OR?: unknown[] }> } } | undefined) =>
      arg?.where?.AND?.[0]?.OR ?? [];

    /** A listing record whose only listed release carries the given date. */
    const listedRecord = (id: string, displayName: string, releasedOn: Date | null) => ({
      id,
      displayName,
      releases:
        releasedOn === null
          ? []
          : [
              {
                release: {
                  id: `${id}-r`,
                  title: `${displayName} LP`,
                  releasedOn,
                  publishedAt: new Date('2024-01-01'),
                  deletedOn: null,
                },
              },
            ],
    });

    it('lists only active, published, non-deleted artists with a listed direct release', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).toEqual({
        isActive: true,
        publishedOn: { not: null },
        OR: notDeleted,
        releases: listedReleaseClause,
      });
    });

    it('selects a narrow projection with no contact fields', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty('include');
      expect(arg?.select).not.toHaveProperty('phone');
      expect(arg?.select).not.toHaveProperty('email');
      expect(arg?.select).not.toHaveProperty('address1');
    });

    // Display-image candidates: the human's chosen rows or the job's suggested
    // rows. `displayOrder: { gte: 0 }` matches only numbers (null and absent
    // both fail), and the cap is applied by the service after resolution —
    // Mongo sorts nulls first, so a DB-level take would return unchosen rows.
    it('selects the chosen-or-suggested bio images in sort order without a DB cap', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({
        where: { OR: [{ displayOrder: { gte: 0 } }, { isPrimary: true }] },
        orderBy: { sortOrder: 'asc' },
      });
      expect(arg?.select?.bioImages).not.toHaveProperty('take');
    });

    it('selects the display-image fields on listing bio images', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({
        select: { alt: true, isPrimary: true, displayOrder: true },
      });
    });

    it('selects the band graph and the narrow release projection', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.select?.members).toBeDefined();
      expect(arg?.select?.memberOf).toBeDefined();
      expect(arg?.select?.releases).toEqual({
        select: {
          release: {
            select: { id: true, title: true, releasedOn: true, publishedAt: true, deletedOn: true },
          },
        },
      });
    });

    it('matches the search term against every name field, aka names, genres, and release titles', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ search: 'foo', sort: 'alpha', skip: 0, take: 24 });

      const contains = { contains: 'foo', mode: 'insensitive' };
      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(searchOr(arg as never)).toEqual([
        { firstName: contains },
        { middleName: contains },
        { surname: contains },
        { displayName: contains },
        { title: contains },
        { suffix: contains },
        { slug: contains },
        { akaNames: contains },
        { genres: contains },
        {
          releases: {
            some: {
              release: { title: contains, publishedAt: { not: null }, OR: notDeleted },
            },
          },
        },
      ]);
    });

    it('requires every word of a composed display name to match some field', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({
        search: 'Dr. Quillon M. Tokensmith Jr.',
        sort: 'alpha',
        skip: 0,
        take: 24,
      });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      const and = (arg?.where?.AND ?? []) as Array<{ OR: Array<{ firstName?: unknown }> }>;
      expect(and.map(({ OR }) => OR[0].firstName)).toEqual(
        ['Dr', 'Quillon', 'M', 'Tokensmith', 'Jr'].map((token) => ({
          contains: token,
          mode: 'insensitive',
        }))
      );
    });

    it('omits the search clause when the term holds nothing searchable', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ search: ' . - ', sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).not.toHaveProperty('AND');
    });

    it('omits the search clause when no term is given', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).not.toHaveProperty('AND');
    });

    it('fetches every listed artist for the A–Z order instead of paging in the database', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'alpha', skip: 24, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty('skip');
      expect(arg).not.toHaveProperty('take');
      expect(arg).not.toHaveProperty('orderBy');
    });

    it('sorts an artist without a stored display name by the name composed from its parts', async () => {
      const composed = {
        ...listedRecord('composed', '', null),
        displayName: null,
        title: 'Dr.',
        firstName: 'Quillon',
        middleName: null,
        surname: 'Tokensmith',
        suffix: null,
      };
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('e', 'Eve', null),
        composed,
        listedRecord('c', 'Cara', null),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      // "Dr. Quillon Tokensmith" files under D — between Cara and Eve.
      expect(result.map(({ id }) => id)).toEqual(['c', 'composed', 'e']);
    });

    it('orders A–Z without regard to letter case', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('z', 'Zed', null),
        listedRecord('b', 'bob', null),
        listedRecord('a', 'Alice', null),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['a', 'b', 'z']);
    });

    it('breaks an A–Z tie by id so pages never reshuffle', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('2', 'Same', null),
        listedRecord('1', 'Same', null),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['1', '2']);
    });

    it('slices the A–Z order to the requested page', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('c', 'Cara', null),
        listedRecord('a', 'Alice', null),
        listedRecord('b', 'Bob', null),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'alpha', skip: 1, take: 1 });

      expect(result.map(({ id }) => id)).toEqual(['b']);
    });

    it('fetches every listed artist for the newest-release order instead of paging in the database', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listListed({ sort: 'newest', skip: 24, take: 24 });

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg).not.toHaveProperty('skip');
      expect(arg).not.toHaveProperty('take');
      expect(arg).not.toHaveProperty('orderBy');
    });

    it('orders by the newest listed release date, newest first', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('old', 'Old Act', new Date('2010-01-01')),
        listedRecord('new', 'New Act', new Date('2025-01-01')),
        listedRecord('mid', 'Mid Act', new Date('2018-01-01')),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'newest', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['new', 'mid', 'old']);
    });

    it('ignores unlisted releases when ranking by newest release', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        {
          ...listedRecord('drafty', 'Drafty', new Date('2010-01-01')),
          releases: [
            ...listedRecord('drafty', 'Drafty', new Date('2010-01-01')).releases,
            {
              release: {
                id: 'draft',
                title: 'Draft',
                releasedOn: new Date('2030-01-01'),
                publishedAt: null,
                deletedOn: null,
              },
            },
          ],
        },
        listedRecord('steady', 'Steady', new Date('2020-01-01')),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'newest', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['steady', 'drafty']);
    });

    it('breaks a newest-release tie by display name', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('zed', 'Zed', new Date('2020-01-01')),
        listedRecord('abe', 'Abe', new Date('2020-01-01')),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'newest', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['abe', 'zed']);
    });

    it('sorts an artist with no dated listed release last', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('undated', 'Undated', null),
        listedRecord('dated', 'Dated', new Date('2001-01-01')),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'newest', skip: 0, take: 24 });

      expect(result.map(({ id }) => id)).toEqual(['dated', 'undated']);
    });

    it('slices the newest-release order to the requested page', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        listedRecord('a', 'A', new Date('2025-01-01')),
        listedRecord('b', 'B', new Date('2024-01-01')),
        listedRecord('c', 'C', new Date('2023-01-01')),
        listedRecord('d', 'D', new Date('2022-01-01')),
      ] as never);

      const result = await ArtistRepository.listListed({ sort: 'newest', skip: 1, take: 2 });

      expect(result.map(({ id }) => id)).toEqual(['b', 'c']);
    });

    it('maps a connection failure to an UNAVAILABLE DataError', async () => {
      vi.mocked(prisma.artist.findMany).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('down', '6.0.0')
      );

      await expect(
        ArtistRepository.listListed({ sort: 'alpha', skip: 0, take: 24 })
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
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
      expect(arg?.include).toBeUndefined();
      expect(arg?.select?.releases).toBeDefined();
      expect(arg?.select?.bioImages).toBeDefined();
    });

    it('loads the releases of every band the artist is a member of with the same release graph', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.findPublishedBySlugWithReleases('john-doe');

      const arg = vi.mocked(prisma.artist.findFirst).mock.calls[0][0];
      const select = arg?.select as Record<string, unknown> | undefined;
      const memberOf = select?.memberOf as {
        include: { artist: { select: { releases: unknown } } };
      };
      expect(memberOf.include.artist.select.releases).toEqual(select?.releases);
    });

    describe('selects no private artist field anywhere in the graph', () => {
      /** Every artist-level `select` in the query: the artist, its band members,
       * its bands, and each credited artist on every loaded release. */
      const artistSelects = async (): Promise<Array<[string, Record<string, unknown>]>> => {
        vi.mocked(prisma.artist.findFirst).mockResolvedValue(null);
        await ArtistRepository.findPublishedBySlugWithReleases('john-doe');
        const select = vi.mocked(prisma.artist.findFirst).mock.calls[0][0]?.select as Record<
          string,
          never
        >;
        const releaseArtistSelect = (releases: {
          include: { release: { include: { artistReleases: { include: { artist: never } } } } };
        }) => releases.include.release.include.artistReleases.include.artist;
        const memberOf = select.memberOf as {
          include: { artist: { select: Record<string, unknown> } };
        };
        return [
          ['artist', select],
          ['members.member', (select.members as { include: { member: never } }).include.member],
          ['memberOf.artist', memberOf.include.artist.select],
          ['releases.release.artistReleases.artist', releaseArtistSelect(select.releases)],
          [
            'memberOf.artist.releases.release.artistReleases.artist',
            releaseArtistSelect(memberOf.include.artist.select.releases as never),
          ],
        ].map(([path, value]) => [
          path as string,
          ((value as { select?: Record<string, unknown> }).select ?? value) as Record<
            string,
            unknown
          >,
        ]);
      };

      it.each(ARTIST_PRIVATE_FIELDS)('omits %s at every artist level', async (field) => {
        const selects = await artistSelects();

        expect(selects.filter(([, select]) => field in select).map(([path]) => path)).toEqual([]);
      });

      it('projects every artist level through an explicit select', async () => {
        const selects = await artistSelects();

        expect(selects.map(([, select]) => select.slug)).toEqual([true, true, true, true, true]);
      });
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

    it('writes the error and startedAt when provided, clearing progress for the new pending run', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);
      const startedAt = new Date('2026-06-20T00:00:00Z');

      await ArtistRepository.setBioStatus('a1', 'pending', { error: null, startedAt });

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: {
          bioStatus: 'pending',
          bioError: null,
          bioStartedAt: startedAt,
          bioProgress: null,
        },
      });
    });

    it('clears bioProgress when marking a run pending (a new run never shows the old stage)', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioStatus('a1', 'pending');

      const arg = vi.mocked(prisma.artist.update).mock.calls[0][0];
      expect(arg?.data?.bioProgress).toBeNull();
    });

    it('does not touch bioProgress when marking a run processing', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioStatus('a1', 'processing');

      const arg = vi.mocked(prisma.artist.update).mock.calls[0][0];
      expect(arg?.data && 'bioProgress' in arg.data).toBe(false);
    });
  });

  describe('setBioProgress', () => {
    it('writes a progress checkpoint object to the artist', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);
      const progress = { stage: 'drafting' as const, at: '2026-07-08T00:00:00.000Z' };

      await ArtistRepository.setBioProgress('a1', progress);

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioProgress: progress },
      });
    });

    it('clears the progress to a DB null when given null', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioProgress('a1', null);

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioProgress: null },
      });
    });
  });

  describe('setBioJobToken', () => {
    it('sets the job token when given a string', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioJobToken('a1', 'tok');

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioJobToken: 'tok' },
      });
    });

    it('clears the job token when given null', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({ id: 'a' } as never);

      await ArtistRepository.setBioJobToken('a1', null);

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { bioJobToken: null },
      });
    });
  });

  describe('claimBioJobToken', () => {
    it('updates only the row matching id, token, and processing status', async () => {
      vi.mocked(prisma.artist.updateMany).mockResolvedValue({ count: 1 } as never);

      await ArtistRepository.claimBioJobToken('a1', 'tok');

      expect(prisma.artist.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', bioJobToken: 'tok', bioStatus: 'processing' },
        data: { bioJobToken: null },
      });
    });

    it('returns true when exactly one row was claimed', async () => {
      vi.mocked(prisma.artist.updateMany).mockResolvedValue({ count: 1 } as never);

      expect(await ArtistRepository.claimBioJobToken('a1', 'tok')).toBe(true);
    });

    it('returns false when no row matched (already claimed)', async () => {
      vi.mocked(prisma.artist.updateMany).mockResolvedValue({ count: 0 } as never);

      expect(await ArtistRepository.claimBioJobToken('a1', 'tok')).toBe(false);
    });
  });

  describe('replaceBioContent', () => {
    const content = {
      shortBio: '<p>short</p>',
      bio: '<p>long</p>',
      altBio: '<p>alt</p>',
      genres: 'rock',
      bioModel: 'gemini-2.5-flash',
      images: [
        {
          url: 'https://cdn.example/gen.webp',
          thumbnailUrl: null,
          title: null,
          attribution: null,
          license: null,
          licenseUrl: null,
          sourceUrl: null,
          originalUrl: null,
          width: null,
          height: null,
          isPrimary: true,
          kind: null,
          alt: null,
          hasFace: null,
          faceScore: null,
          sortOrder: 0,
        },
      ],
      links: [
        {
          label: 'Wikipedia',
          url: 'https://en.wikipedia.org/wiki/X',
          kind: 'wikipedia',
          sortOrder: 0,
        },
      ],
    };

    // A stand-in transaction client whose reads default to "no custom rows".
    const buildTx = (survivors: {
      images?: Array<{ url: string }>;
      links?: Array<{ url: string }>;
    }) => ({
      artistBioImage: {
        findMany: vi.fn().mockResolvedValue(survivors.images ?? []),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      artistBioLink: {
        findMany: vi.fn().mockResolvedValue(survivors.links ?? []),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      artist: { update: vi.fn().mockResolvedValue({ id: 'a1' }) },
    });

    it('reads the surviving custom rows inside the transaction', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      expect(tx.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', origin: { in: ['custom', 'linked'] } },
        select: { url: true },
      });
      expect(tx.artistBioLink.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', origin: 'custom' },
        select: { url: true },
      });
    });

    it('deletes only generated and legacy rows (Mongo isSet quirk is the contract)', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      const legacyOr = {
        artistId: 'a1',
        OR: [{ origin: 'generated' }, { origin: null }, { origin: { isSet: false } }],
      };
      expect(tx.artistBioImage.deleteMany).toHaveBeenCalledWith({ where: legacyOr });
      expect(tx.artistBioLink.deleteMany).toHaveBeenCalledWith({ where: legacyOr });
    });

    it('recreates the incoming rows stamped origin generated and updates the scalars', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'a1' });
      expect(arg.data.shortBio).toBe('<p>short</p>');
      expect(arg.data.bioImages.create).toEqual([{ ...content.images[0], origin: 'generated' }]);
      expect(arg.data.bioLinks.create).toEqual([{ ...content.links[0], origin: 'generated' }]);
    });

    // Display images are chosen by humans and survive regeneration (ADR-0008):
    // the recreated generated rows must never carry a display position, so the
    // AI can suggest (isPrimary) but never choose.
    it('never writes a display position on the recreated generated rows', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.data.bioImages.create[0]).not.toHaveProperty('displayOrder');
    });

    it('carries the face signal fields into the recreated generated image rows', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      const contentWithFace = {
        ...content,
        images: [{ ...content.images[0], hasFace: true, faceScore: 97.4 }],
      };

      await ArtistRepository.replaceBioContent('a1', contentWithFace);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.data.bioImages.create[0]).toMatchObject({ hasFace: true, faceScore: 97.4 });
    });

    it('does not re-insert a generated image whose url case-insensitively matches a custom survivor', async () => {
      const tx = buildTx({ images: [{ url: 'HTTPS://CDN.EXAMPLE/GEN.WEBP' }] });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.data.bioImages.create).toEqual([]);
    });

    it('does not re-insert a generated link whose url case-insensitively matches a custom survivor', async () => {
      const tx = buildTx({ links: [{ url: 'HTTPS://EN.WIKIPEDIA.ORG/wiki/X' }] });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.data.bioLinks.create).toEqual([]);
    });

    it('drops a case-insensitive duplicate-url generated link so the unique index never trips', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      const contentWithDupLinks = {
        ...content,
        links: [
          { label: 'Site', url: 'https://dup.example/x', kind: null, sortOrder: 0 },
          { label: 'Site again', url: 'https://DUP.EXAMPLE/x', kind: null, sortOrder: 1 },
        ],
      };

      await ArtistRepository.replaceBioContent('a1', contentWithDupLinks);

      const arg = tx.artist.update.mock.calls[0][0];
      expect(arg.data.bioLinks.create).toEqual([
        {
          label: 'Site',
          url: 'https://dup.example/x',
          kind: null,
          sortOrder: 0,
          origin: 'generated',
        },
      ]);
    });

    it('dedupes per-row: drops a matched link but still inserts a different unmatched link in the same call', async () => {
      // Wikipedia URL matches a custom survivor; Official Site does not.
      const tx = buildTx({ links: [{ url: 'HTTPS://EN.WIKIPEDIA.ORG/wiki/X' }] });
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      const contentWithTwoLinks = {
        ...content,
        links: [
          {
            label: 'Wikipedia',
            url: 'https://en.wikipedia.org/wiki/X',
            kind: 'wikipedia',
            sortOrder: 0,
          },
          { label: 'Official Site', url: 'https://artist.com', kind: 'official', sortOrder: 1 },
        ],
      };

      await ArtistRepository.replaceBioContent('a1', contentWithTwoLinks);

      const arg = tx.artist.update.mock.calls[0][0];
      // Only the unmatched link should be created; dedupe is per-row, not all-or-nothing.
      expect(arg.data.bioLinks.create).toEqual([
        {
          label: 'Official Site',
          url: 'https://artist.com',
          kind: 'official',
          sortOrder: 1,
          origin: 'generated',
        },
      ]);
    });

    it('passes extended timeout options to $transaction', async () => {
      const tx = buildTx({});
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', content);

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 15_000,
        maxWait: 5_000,
      });
    });
  });

  describe('getBioGenerationState', () => {
    it('selects and returns the bioJobToken', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioJobToken: 'tok' } as never);

      const result = await ArtistRepository.getBioGenerationState('a1');

      expect(result).toEqual({ bioJobToken: 'tok' });
      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioJobToken).toBe(true);
    });

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

    it('selects origin on the bioImages and bioLinks selects', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a3');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { origin: true } });
      expect(arg?.select?.bioLinks).toMatchObject({ select: { origin: true } });
    });

    /**
     * replaceBioContent persists width/height, and BioStatusImage exposes them,
     * but the projection omitted them — so every consumer's `image.width ??
     * fallback` silently took the fallback and the preview dialog always
     * reserved 800x600. Only a projection-level assertion can catch this: the
     * service specs mock this repository, so the missing columns are invisible
     * to them.
     */
    it('selects the image intrinsics on the bioImages select', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a4');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { width: true, height: true } });
    });

    it('selects displayOrder on the bioImages select', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a8');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { displayOrder: true } });
    });

    it('selects licenseUrl on the bioImages select', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a5');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { licenseUrl: true } });
    });

    it('selects hasFace on the bioImages select', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a6');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { hasFace: true } });
    });

    it('selects faceScore on the bioImages select', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a7');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioImages).toMatchObject({ select: { faceScore: true } });
    });

    it('selects bioProgress so the status endpoint can surface it', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'processing' } as never);

      await ArtistRepository.getBioGenerationState('a4');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioProgress).toBe(true);
    });
  });

  describe('listVocabularySource', () => {
    it('filters soft-deleted artists with the unset-safe OR, not a bare null', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listVocabularySource('genres');

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where?.OR).toEqual([{ deletedOn: null }, { deletedOn: { isSet: false } }]);
    });

    it('does not filter on deletedOn outside the OR clause', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listVocabularySource('genres');

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).not.toHaveProperty('deletedOn');
    });

    it('selects only the requested column', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listVocabularySource('genres');

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.select).toEqual({ genres: true });
    });

    it('selects the tags column when asked for tags', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listVocabularySource('tags');

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.select).toEqual({ tags: true });
    });

    it('returns the raw un-split column values', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        { genres: 'indie-rock,post-punk' },
        { genres: 'noise' },
      ] as never);

      const rows = await ArtistRepository.listVocabularySource('genres');

      expect(rows).toEqual(['indie-rock,post-punk', 'noise']);
    });

    it('drops rows whose column is empty', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([
        { genres: 'noise' },
        { genres: null },
        { genres: '' },
      ] as never);

      const rows = await ArtistRepository.listVocabularySource('genres');

      expect(rows).toEqual(['noise']);
    });

    it('includes unpublished artists, so admin vocabulary is complete', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([] as never);

      await ArtistRepository.listVocabularySource('genres');

      const arg = vi.mocked(prisma.artist.findMany).mock.calls[0][0];
      expect(arg?.where).not.toHaveProperty('publishedOn');
    });
  });

  describe('updateEnrichedField', () => {
    it('writes the single typed field plus the auditing updatedBy', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);

      await ArtistRepository.updateEnrichedField(
        'a'.repeat(24),
        { bornOn: new Date('1985-03-15T00:00:00.000Z') },
        'admin-1'
      );

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a'.repeat(24) },
        data: { bornOn: new Date('1985-03-15T00:00:00.000Z'), updatedBy: 'admin-1' },
      });
    });
  });

  describe('image-links job lifecycle', () => {
    it('setImageLinksStatus writes the status and only the provided fields', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);

      await ArtistRepository.setImageLinksStatus('a1', 'processing');

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { imageLinksStatus: 'processing' },
      });
    });

    it('setImageLinksStatus writes error, startedAt and addedCount when provided', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);
      const startedAt = new Date('2026-09-25T00:00:00Z');

      await ArtistRepository.setImageLinksStatus('a1', 'succeeded', {
        error: null,
        startedAt,
        addedCount: 4,
      });

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: {
          imageLinksStatus: 'succeeded',
          imageLinksError: null,
          imageLinksStartedAt: startedAt,
          imageLinksAddedCount: 4,
        },
      });
    });

    it('setImageLinksStatus clears the previous addedCount when a run is marked pending', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);

      await ArtistRepository.setImageLinksStatus('a1', 'pending');

      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { imageLinksStatus: 'pending', imageLinksAddedCount: null },
      });
    });

    it('setImageLinksJobToken sets and clears the token', async () => {
      vi.mocked(prisma.artist.update).mockResolvedValue({} as never);

      await ArtistRepository.setImageLinksJobToken('a1', 'tok');
      await ArtistRepository.setImageLinksJobToken('a1', null);

      expect(vi.mocked(prisma.artist.update).mock.calls).toEqual([
        [{ where: { id: 'a1' }, data: { imageLinksJobToken: 'tok' } }],
        [{ where: { id: 'a1' }, data: { imageLinksJobToken: null } }],
      ]);
    });

    it('claimImageLinksJobToken claims only the processing row with a matching token', async () => {
      vi.mocked(prisma.artist.updateMany).mockResolvedValue({ count: 1 } as never);

      const claimed = await ArtistRepository.claimImageLinksJobToken('a1', 'tok');

      expect(claimed).toBe(true);
      expect(prisma.artist.updateMany).toHaveBeenCalledWith({
        where: { id: 'a1', imageLinksJobToken: 'tok', imageLinksStatus: 'processing' },
        data: { imageLinksJobToken: null },
      });
    });

    it('claimImageLinksJobToken returns false when nothing matched', async () => {
      vi.mocked(prisma.artist.updateMany).mockResolvedValue({ count: 0 } as never);

      expect(await ArtistRepository.claimImageLinksJobToken('a1', 'tok')).toBe(false);
    });

    it('getImageLinksJobState selects the job columns plus slug', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ slug: 'x' } as never);

      const state = await ArtistRepository.getImageLinksJobState('a1');

      expect(state).toEqual({ slug: 'x' });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        select: {
          slug: true,
          imageLinksStatus: true,
          imageLinksError: true,
          imageLinksStartedAt: true,
          imageLinksJobToken: true,
          imageLinksAddedCount: true,
        },
      });
    });
  });

  describe('reference-role link filtering', () => {
    it('getBioGenerationState only selects links that play the reference role', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ bioStatus: 'succeeded' } as never);

      await ArtistRepository.getBioGenerationState('a1');

      const arg = vi.mocked(prisma.artist.findUnique).mock.calls[0][0];
      expect(arg?.select?.bioLinks).toMatchObject({
        where: { OR: [{ reference: true }, { reference: null }, { reference: { isSet: false } }] },
      });
    });

    it('replaceBioContent shields custom AND linked images from re-insertion', async () => {
      const tx = {
        artistBioImage: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        artistBioLink: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        artist: { update: vi.fn().mockResolvedValue({ id: 'a1' }) },
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await ArtistRepository.replaceBioContent('a1', {
        shortBio: '',
        bio: '',
        altBio: '',
        genres: null,
        bioModel: 'm',
        images: [],
        links: [],
      });

      expect(tx.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', origin: { in: ['custom', 'linked'] } },
        select: { url: true },
      });
    });
  });
});
