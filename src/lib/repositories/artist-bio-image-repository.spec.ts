/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtistBioImageRepository } from './artist-bio-image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artistBioImage: {
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
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
});
