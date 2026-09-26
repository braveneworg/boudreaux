/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtistBioImageRepository } from './artist-bio-image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    artistBioImage: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ArtistBioImageRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('appends a new bio image row after the current max sortOrder', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: 2 },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-9' } as never);

      const created = await ArtistBioImageRepository.create({
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

      await ArtistBioImageRepository.create({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('forwards isPrimary true when supplied', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-2' } as never);

      await ArtistBioImageRepository.create({
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

      await ArtistBioImageRepository.create({
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

      await ArtistBioImageRepository.create({
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

      await ArtistBioImageRepository.create({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      const arg = vi.mocked(prisma.artistBioImage.create).mock.calls[0][0];
      expect(arg.data.licenseUrl).toBeUndefined();
    });

    it('stamps origin custom on the created row (manual-upload path)', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.create).mockResolvedValue({ id: 'img-4' } as never);

      await ArtistBioImageRepository.create({ artistId: 'a1', url: 'https://cdn.example/x.webp' });

      expect(prisma.artistBioImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ origin: 'custom' }),
      });
    });
  });

  describe('delete', () => {
    it('deletes the image row and returns its urls for cleanup', async () => {
      vi.mocked(prisma.artistBioImage.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
        thumbnailUrl: null,
      } as never);
      const removed = await ArtistBioImageRepository.delete('img-1');
      expect(removed.url).toBe('https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp');
    });

    it('includes thumbnailUrl in the return contract', async () => {
      vi.mocked(prisma.artistBioImage.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/img/0-abc.webp',
        thumbnailUrl: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      } as never);
      const removed = await ArtistBioImageRepository.delete('img-1');
      expect(removed.thumbnailUrl).toBe(
        'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp'
      );
    });
  });

  describe('findForRehost', () => {
    it('selects the rehost projection filtered by artistId', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([{ id: 'img-1' }] as never);

      const result = await ArtistBioImageRepository.findForRehost('a1');

      expect(result).toEqual([{ id: 'img-1' }]);
      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        select: { id: true, url: true, thumbnailUrl: true, originalUrl: true },
      });
    });
  });

  describe('findCustomUrls', () => {
    it('queries custom-origin rows for the artist, ordered by sortOrder, url-only', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([] as never);

      await ArtistBioImageRepository.findCustomUrls('a1');

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

      const result = await ArtistBioImageRepository.findCustomUrls('a1');

      expect(result).toEqual(['https://cdn.example/1.webp', 'https://cdn.example/2.webp']);
    });
  });

  describe('updateUrl', () => {
    it('updates the image row url by id', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistBioImageRepository.updateUrl('img-1', 'https://cdn.example/new.webp');

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { url: 'https://cdn.example/new.webp' },
      });
    });
  });

  describe('updateAttribution', () => {
    it('updates the attribution field by id', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistBioImageRepository.updateAttribution('img-1', 'New credit');

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { attribution: 'New credit' },
      });
    });

    it('supports clearing the attribution to null', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistBioImageRepository.updateAttribution('img-1', null);

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { attribution: null },
      });
    });
  });

  describe('updateAlt', () => {
    it('updates the alt text by id', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistBioImageRepository.updateAlt('img-1', 'Ceschi on stage');

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { alt: 'Ceschi on stage' },
      });
    });

    it('supports clearing the alt text to null', async () => {
      vi.mocked(prisma.artistBioImage.update).mockResolvedValue({} as never);

      await ArtistBioImageRepository.updateAlt('img-1', null);

      expect(prisma.artistBioImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { alt: null },
      });
    });
  });

  describe('findManyByArtist', () => {
    it('lists the artist rows in pool (sortOrder) order', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([{ id: 'img-1' }] as never);

      const rows = await ArtistBioImageRepository.findManyByArtist('a1');

      expect(rows).toEqual([{ id: 'img-1' }]);
      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findManyByIds', () => {
    it('selects the eligibility projection scoped to the artist', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([
        { id: 'img-1', alt: 'x', origin: 'generated' },
      ] as never);

      const rows = await ArtistBioImageRepository.findManyByIds('a1', ['img-1', 'img-2']);

      expect(rows).toEqual([{ id: 'img-1', alt: 'x', origin: 'generated' }]);
      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', id: { in: ['img-1', 'img-2'] } },
        select: { id: true, alt: true, origin: true },
      });
    });

    it('short-circuits to an empty list without querying when no ids are given', async () => {
      const rows = await ArtistBioImageRepository.findManyByIds('a1', []);

      expect(rows).toEqual([]);
      expect(prisma.artistBioImage.findMany).not.toHaveBeenCalled();
    });
  });

  describe('setDisplayOrder', () => {
    const tx = {
      artistBioImage: {
        updateMany: vi.fn(),
        update: vi.fn(),
      },
    };

    beforeEach(() => {
      tx.artistBioImage.updateMany.mockResolvedValue({ count: 0 });
      tx.artistBioImage.update.mockResolvedValue({});
      vi.mocked(prisma.$transaction).mockImplementation(
        async (callback: unknown) => (callback as (client: typeof tx) => Promise<void>)(tx) as never
      );
    });

    it('clears every position for the artist before writing the new ones', async () => {
      await ArtistBioImageRepository.setDisplayOrder('a1', ['img-b', 'img-a']);

      expect(tx.artistBioImage.updateMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        data: { displayOrder: null },
      });
      expect(tx.artistBioImage.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.artistBioImage.update.mock.invocationCallOrder[0]
      );
    });

    it('writes contiguous positions in the given order, scoped to the artist', async () => {
      await ArtistBioImageRepository.setDisplayOrder('a1', ['img-b', 'img-a']);

      expect(tx.artistBioImage.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'img-b', artistId: 'a1' },
        data: { displayOrder: 0, origin: 'custom' },
      });
      expect(tx.artistBioImage.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'img-a', artistId: 'a1' },
        data: { displayOrder: 1, origin: 'custom' },
      });
    });

    it('promotes every chosen row to custom so regeneration keeps it', async () => {
      await ArtistBioImageRepository.setDisplayOrder('a1', ['img-a']);

      const [call] = tx.artistBioImage.update.mock.calls;
      expect(call[0].data.origin).toBe('custom');
    });

    it('only clears when given an empty list', async () => {
      await ArtistBioImageRepository.setDisplayOrder('a1', []);

      expect(tx.artistBioImage.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.artistBioImage.update).not.toHaveBeenCalled();
    });

    it('runs the clear and the writes inside one transaction', async () => {
      await ArtistBioImageRepository.setDisplayOrder('a1', ['img-a']);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.artistBioImage.updateMany).not.toHaveBeenCalled();
      expect(prisma.artistBioImage.update).not.toHaveBeenCalled();
    });

    it('translates a transaction failure into a DataError', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('boom'));

      await expect(ArtistBioImageRepository.setDisplayOrder('a1', ['img-a'])).rejects.toMatchObject(
        {
          name: 'DataError',
        }
      );
    });
  });

  describe('createMany', () => {
    it('inserts the rows after the current max sortOrder, in order', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: 4 },
      } as never);
      vi.mocked(prisma.artistBioImage.createMany).mockResolvedValue({ count: 2 } as never);

      const count = await ArtistBioImageRepository.createMany([
        { artistId: 'a1', url: 'https://cdn/1', origin: 'linked', hasFace: true, faceScore: 91 },
        { artistId: 'a1', url: 'https://cdn/2', origin: 'linked' },
      ]);

      expect(count).toBe(2);
      expect(prisma.artistBioImage.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            artistId: 'a1',
            url: 'https://cdn/1',
            origin: 'linked',
            hasFace: true,
            faceScore: 91,
            isPrimary: false,
            sortOrder: 5,
          }),
          expect.objectContaining({ url: 'https://cdn/2', sortOrder: 6 }),
        ],
      });
    });

    it('stamps each row with its content and perceptual hashes', async () => {
      vi.mocked(prisma.artistBioImage.aggregate).mockResolvedValue({
        _max: { sortOrder: null },
      } as never);
      vi.mocked(prisma.artistBioImage.createMany).mockResolvedValue({ count: 2 } as never);

      await ArtistBioImageRepository.createMany([
        {
          artistId: 'a1',
          url: 'https://cdn/1',
          origin: 'linked',
          contentHash: 'sha-1',
          perceptualHash: '00000000000000ff',
        },
        { artistId: 'a1', url: 'https://cdn/2', origin: 'linked' },
      ]);

      const [[{ data }]] = vi.mocked(prisma.artistBioImage.createMany).mock.calls as unknown as [
        [{ data: Array<Record<string, unknown>> }],
      ];
      expect(
        data.map(({ contentHash, perceptualHash }) => ({ contentHash, perceptualHash }))
      ).toEqual([
        { contentHash: 'sha-1', perceptualHash: '00000000000000ff' },
        { contentHash: null, perceptualHash: null },
      ]);
    });

    it('returns 0 without touching the database for an empty batch', async () => {
      const count = await ArtistBioImageRepository.createMany([]);

      expect(count).toBe(0);
      expect(prisma.artistBioImage.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findExistingUrls', () => {
    it('returns the set of stored and original URLs for the artist', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([
        { url: 'https://cdn/a', originalUrl: 'https://src/a' },
        { url: 'https://cdn/b', originalUrl: null },
      ] as never);

      const urls = await ArtistBioImageRepository.findExistingUrls('a1');

      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        select: { url: true, originalUrl: true },
      });
      expect([...urls].sort()).toEqual(['https://cdn/a', 'https://cdn/b', 'https://src/a']);
    });
  });

  describe('findFingerprints', () => {
    it('returns the url and hashes of every pool row that carries a hash', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([
        { url: 'https://cdn/a', contentHash: 'sha-a', perceptualHash: '000000000000000a' },
        { url: 'https://cdn/b', contentHash: null, perceptualHash: '000000000000000b' },
        { url: 'https://cdn/legacy', contentHash: null, perceptualHash: null },
      ] as never);

      const fingerprints = await ArtistBioImageRepository.findFingerprints('a1');

      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1' },
        select: { url: true, contentHash: true, perceptualHash: true },
      });
      expect(fingerprints).toEqual([
        { url: 'https://cdn/a', contentHash: 'sha-a', perceptualHash: '000000000000000a' },
        { url: 'https://cdn/b', contentHash: null, perceptualHash: '000000000000000b' },
      ]);
    });

    it('reads a hash field missing from a legacy document as null', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([
        { url: 'https://cdn/a', contentHash: 'sha-a' },
      ] as never);

      const fingerprints = await ArtistBioImageRepository.findFingerprints('a1');

      expect(fingerprints).toEqual([
        { url: 'https://cdn/a', contentHash: 'sha-a', perceptualHash: null },
      ]);
    });

    it('limits the rows to the given origins', async () => {
      vi.mocked(prisma.artistBioImage.findMany).mockResolvedValue([] as never);

      await ArtistBioImageRepository.findFingerprints('a1', ['custom', 'linked']);

      expect(prisma.artistBioImage.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', origin: { in: ['custom', 'linked'] } },
        select: { url: true, contentHash: true, perceptualHash: true },
      });
    });
  });
});
