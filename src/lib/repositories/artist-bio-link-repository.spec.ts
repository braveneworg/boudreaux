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
      create: vi.fn(),
      aggregate: vi.fn(),
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

  describe('delete', () => {
    it('deletes the link row by id', async () => {
      await ArtistBioLinkRepository.delete('link-1');
      expect(prisma.artistBioLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
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
});
