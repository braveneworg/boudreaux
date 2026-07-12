/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import { DataError } from '@/lib/types/domain/errors';

import { ArtistRepository } from './artist-repository';

vi.mock('server-only', () => ({}));

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

  describe('findCustomBioImageUrls', () => {
    it('queries custom-origin rows for the artist, ordered by sortOrder, url-only', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([] as never);

      await ArtistRepository.findCustomBioImageUrls('a1');

      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', origin: 'custom' },
        orderBy: { sortOrder: 'asc' },
        select: { url: true },
      });
    });

    it('maps the rows to their url strings', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([
        { url: 'https://cdn.example/1.webp' },
        { url: 'https://cdn.example/2.webp' },
      ] as never);

      const result = await ArtistRepository.findCustomBioImageUrls('a1');

      expect(result).toEqual(['https://cdn.example/1.webp', 'https://cdn.example/2.webp']);
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
        where: { artistId: 'a1', origin: 'custom' },
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

  describe('createBioImage', () => {
    it('appends a new bio image row after the current max sortOrder', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: 2 },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-9' } as never);

      const created = await ArtistRepository.createBioImage({
        artistId: 'a1',
        url: 'https://cdn.example/x.webp',
        attribution: 'Uploaded',
      });

      expect(prisma.artistBioImage.aggregate).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        _max: { sortOrder: true },
      });
      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          artistId: 'a1',
          url: 'https://cdn.example/x.webp',
          attribution: 'Uploaded',
          isPrimary: false,
          sortOrder: 3,
        }),
      });
      expect(created).toEqual({ id: 'img-9' });
    });

    it('starts sortOrder at 0 when the artist has no bio images yet', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-1' } as never);

      await ArtistRepository.createBioImage({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('forwards isPrimary true when supplied', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-2' } as never);

      await ArtistRepository.createBioImage({
        artistId: 'a1',
        url: 'https://cdn.example/x.webp',
        isPrimary: true,
      });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPrimary: true }),
      });
    });

    it('forwards a supplied optional field to create', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-3' } as never);

      await ArtistRepository.createBioImage({
        artistId: 'a1',
        url: 'https://cdn.example/x.webp',
        thumbnailUrl: 'https://cdn.example/t.webp',
      });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ thumbnailUrl: 'https://cdn.example/t.webp' }),
      });
    });

    it('forwards a supplied licenseUrl to create', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-5' } as never);

      await ArtistRepository.createBioImage({
        artistId: 'a1',
        url: 'https://cdn.example/x.webp',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        }),
      });
    });

    it('creates a row with an undefined licenseUrl when the custom upload omits it', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-6' } as never);

      await ArtistRepository.createBioImage({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      const arg = vi.mocked(prisma.artistBioImage.create).mock.calls[0][0];
      expect(arg.data.licenseUrl).toBeUndefined();
    });

    it('stamps origin custom on the created row (manual-upload path)', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-4' } as never);

      await ArtistRepository.createBioImage({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ origin: 'custom' }),
      });
    });
  });

  describe('createBioLink', () => {
    it('appends a new bio link row after the current max sortOrder', async () => {
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: 4 },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'link-9' } as never);

      const created = await ArtistRepository.createBioLink({
        artistId: 'a1',
        label: 'Official site',
        url: 'https://example.com',
      });

      expect(prisma.artistBioLink.aggregate).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        _max: { sortOrder: true },
      });
      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          artistId: 'a1',
          label: 'Official site',
          url: 'https://example.com',
          sortOrder: 5,
        }),
      });
      expect(created).toEqual({ id: 'link-9' });
    });

    it('starts sortOrder at 0 when the artist has no bio links yet', async () => {
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'link-1' } as never);

      await ArtistRepository.createBioLink({
        artistId: 'a1',
        label: 'Site',
        url: 'https://example.com',
      });

      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('forwards a supplied kind to create', async () => {
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'link-2' } as never);

      await ArtistRepository.createBioLink({
        artistId: 'a1',
        label: 'Wiki',
        url: 'https://en.wikipedia.org/wiki/X',
        kind: 'wikipedia',
      });

      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'wikipedia' }),
      });
    });

    it('stamps origin custom on the created row (admin-authored path)', async () => {
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'link-3' } as never);

      await ArtistRepository.createBioLink({
        artistId: 'a1',
        label: 'Site',
        url: 'https://example.com',
      });

      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ origin: 'custom' }),
      });
    });
  });

  describe('findBioLinkByUrl', () => {
    it('returns the matching row for the artist and URL', async () => {
      const row = { id: 'link-7', artistId: 'a1', url: 'https://example.com' };
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(row as never);

      const found = await ArtistRepository.findBioLinkByUrl('a1', 'https://example.com');

      expect(prisma.artistBioLink.findFirst).toHaveBeenCalledWith({
        where: { artistId: 'a1', url: 'https://example.com' },
      });
      expect(found).toEqual(row);
    });

    it('returns null when no row matches', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(null as never);

      const found = await ArtistRepository.findBioLinkByUrl('a1', 'https://none.example');

      expect(found).toBeNull();
    });
  });

  describe('updateBioImageAttribution', () => {
    it('updates the attribution field by id', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistRepository.updateBioImageAttribution('img-1', 'New credit');

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { attribution: 'New credit' },
      });
    });

    it('supports clearing the attribution to null', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistRepository.updateBioImageAttribution('img-1', null);

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { attribution: null },
      });
    });
  });
});
