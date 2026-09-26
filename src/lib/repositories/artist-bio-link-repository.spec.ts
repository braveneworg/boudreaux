/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtistBioLinkRepository } from './artist-bio-link-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artistBioLink: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ArtistBioLinkRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('appends a new bio link row after the current max sortOrder', async () => {
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: 4 },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'link-9' } as never);

      const created = await ArtistBioLinkRepository.create({
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

      await ArtistBioLinkRepository.create({
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

      await ArtistBioLinkRepository.create({
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

      await ArtistBioLinkRepository.create({
        artistId: 'a1',
        label: 'Site',
        url: 'https://example.com',
      });

      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ origin: 'custom' }),
      });
    });
  });

  describe('removeReference', () => {
    it('deletes a row that plays no image-source role', async () => {
      vi.mocked(prisma.artistBioLink.findUnique).mockResolvedValue({
        id: 'link-1',
        imageSource: null,
      } as never);

      await ArtistBioLinkRepository.removeReference('link-1');

      expect(prisma.artistBioLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
      expect(prisma.artistBioLink.update).not.toHaveBeenCalled();
    });

    it('only clears the reference flag on a row that is also an image source', async () => {
      vi.mocked(prisma.artistBioLink.findUnique).mockResolvedValue({
        id: 'link-1',
        imageSource: true,
      } as never);

      await ArtistBioLinkRepository.removeReference('link-1');

      expect(prisma.artistBioLink.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { reference: false },
      });
      expect(prisma.artistBioLink.delete).not.toHaveBeenCalled();
    });

    it('is a no-op for an unknown id', async () => {
      vi.mocked(prisma.artistBioLink.findUnique).mockResolvedValue(null);

      await ArtistBioLinkRepository.removeReference('missing');

      expect(prisma.artistBioLink.delete).not.toHaveBeenCalled();
      expect(prisma.artistBioLink.update).not.toHaveBeenCalled();
    });
  });

  describe('restoreReference', () => {
    it('grants the reference role back to an image-only row and returns it', async () => {
      vi.mocked(prisma.artistBioLink.update).mockResolvedValue({
        id: 'link-1',
        reference: true,
        imageSource: true,
      } as never);

      const row = await ArtistBioLinkRepository.restoreReference('link-1');

      expect(prisma.artistBioLink.update).toHaveBeenCalledWith({
        where: { id: 'link-1' },
        data: { reference: true },
      });
      expect(row).toEqual({ id: 'link-1', reference: true, imageSource: true });
    });
  });

  describe('findByUrl', () => {
    it('returns the matching row for the artist and URL', async () => {
      const row = { id: 'link-7', artistId: 'a1', url: 'https://example.com' };
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(row as never);

      const found = await ArtistBioLinkRepository.findByUrl('a1', 'https://example.com');

      expect(prisma.artistBioLink.findFirst).toHaveBeenCalledWith({
        where: { artistId: 'a1', url: 'https://example.com' },
      });
      expect(found).toEqual(row);
    });

    it('returns null when no row matches', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(null as never);

      const found = await ArtistBioLinkRepository.findByUrl('a1', 'https://none.example');

      expect(found).toBeNull();
    });
  });

  describe('image-source role', () => {
    it('findImageSources lists the artist rows flagged imageSource in sort order', async () => {
      vi.mocked(prisma.artistBioLink.findMany).mockResolvedValue([{ id: 'l1' }] as never);

      const rows = await ArtistBioLinkRepository.findImageSources('a1');

      expect(rows).toEqual([{ id: 'l1' }]);
      expect(prisma.artistBioLink.findMany).toHaveBeenCalledWith({
        where: { artistId: 'a1', imageSource: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    it('upsertImageSource creates an image-only custom row when the URL is new', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.artistBioLink.aggregate).mockResolvedValue({
        _max: { sortOrder: 1 },
      } as never);
      vi.mocked(prisma.artistBioLink.create).mockResolvedValue({ id: 'l2' } as never);

      const row = await ArtistBioLinkRepository.upsertImageSource(
        'a1',
        'https://x.test/p',
        'x.test'
      );

      expect(row).toEqual({ id: 'l2' });
      expect(prisma.artistBioLink.create).toHaveBeenCalledWith({
        data: {
          artistId: 'a1',
          label: 'x.test',
          url: 'https://x.test/p',
          kind: 'other',
          origin: 'custom',
          sortOrder: 2,
          reference: false,
          imageSource: true,
        },
      });
    });

    it('upsertImageSource flags an existing row and promotes it to custom so regeneration keeps it', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue({
        id: 'l1',
        origin: 'generated',
        imageSource: false,
      } as never);
      vi.mocked(prisma.artistBioLink.update).mockResolvedValue({
        id: 'l1',
        imageSource: true,
      } as never);

      const row = await ArtistBioLinkRepository.upsertImageSource(
        'a1',
        'https://x.test/p',
        'x.test'
      );

      expect(row).toEqual({ id: 'l1', imageSource: true });
      expect(prisma.artistBioLink.create).not.toHaveBeenCalled();
      expect(prisma.artistBioLink.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { imageSource: true, origin: 'custom' },
      });
    });

    it('upsertImageSource returns an existing flagged row untouched', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue({
        id: 'l1',
        imageSource: true,
      } as never);

      const row = await ArtistBioLinkRepository.upsertImageSource(
        'a1',
        'https://x.test/p',
        'x.test'
      );

      expect(row).toEqual({ id: 'l1', imageSource: true });
      expect(prisma.artistBioLink.update).not.toHaveBeenCalled();
      expect(prisma.artistBioLink.create).not.toHaveBeenCalled();
    });

    it('removeImageSource deletes a row that is image-source only', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue({
        id: 'l1',
        artistId: 'a1',
        reference: false,
        imageSource: true,
      } as never);
      vi.mocked(prisma.artistBioLink.delete).mockResolvedValue({} as never);

      const removed = await ArtistBioLinkRepository.removeImageSource('a1', 'l1');

      expect(removed).toBe(true);
      expect(prisma.artistBioLink.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
      expect(prisma.artistBioLink.update).not.toHaveBeenCalled();
    });

    it('removeImageSource only clears the flag when the row is also a reference link', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue({
        id: 'l1',
        artistId: 'a1',
        reference: null,
        imageSource: true,
      } as never);
      vi.mocked(prisma.artistBioLink.update).mockResolvedValue({} as never);

      const removed = await ArtistBioLinkRepository.removeImageSource('a1', 'l1');

      expect(removed).toBe(true);
      expect(prisma.artistBioLink.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { imageSource: false },
      });
      expect(prisma.artistBioLink.delete).not.toHaveBeenCalled();
    });

    it('removeImageSource returns false when the row is not an image source of that artist', async () => {
      vi.mocked(prisma.artistBioLink.findFirst).mockResolvedValue(null);

      const removed = await ArtistBioLinkRepository.removeImageSource('a1', 'l9');

      expect(removed).toBe(false);
      expect(prisma.artistBioLink.findFirst).toHaveBeenCalledWith({
        where: { id: 'l9', artistId: 'a1', imageSource: true },
      });
    });
  });
});
