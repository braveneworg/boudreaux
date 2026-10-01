/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ImageRepository } from './image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    image: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ImageRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findManyByOwner', () => {
    it('queries images by releaseId owner with a select projection', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValueOnce([{ id: 'a' }] as never);

      const result = await ImageRepository.findManyByOwner({ releaseId: 'release-1' });

      expect(result).toEqual([{ id: 'a' }]);
      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-1' },
        select: { id: true },
      });
    });
  });

  describe('create', () => {
    it('passes the data straight through to prisma.image.create', async () => {
      const created = { id: 'img-1', src: 'x', sortOrder: 0 };
      vi.mocked(prisma.image.create).mockResolvedValueOnce(created as never);

      const result = await ImageRepository.create({
        src: 'x',
        caption: 'cap',
        altText: 'alt',
        releaseId: 'release-1',
        sortOrder: 0,
      });

      expect(result).toBe(created);
      expect(prisma.image.create).toHaveBeenCalledWith({
        data: {
          src: 'x',
          caption: 'cap',
          altText: 'alt',
          releaseId: 'release-1',
          sortOrder: 0,
        },
      });
    });
  });

  describe('findSourceById', () => {
    it('selects only the id, src, and owner of one image', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValueOnce({
        id: 'img-1',
        src: 'https://cdn/x.jpg',
        releaseId: 'release-1',
      } as never);

      const result = await ImageRepository.findSourceById('img-1');

      expect(result).toEqual({ id: 'img-1', src: 'https://cdn/x.jpg', releaseId: 'release-1' });
      expect(vi.mocked(prisma.image.findUnique).mock.calls).toEqual([
        [{ where: { id: 'img-1' }, select: { id: true, src: true, releaseId: true } }],
      ]);
    });
  });

  describe('delete', () => {
    it('deletes the image by id', async () => {
      vi.mocked(prisma.image.delete).mockResolvedValueOnce({} as never);

      await ImageRepository.delete('img-1');

      expect(vi.mocked(prisma.image.delete).mock.calls).toEqual([[{ where: { id: 'img-1' } }]]);
    });
  });

  describe('findListingByRelease', () => {
    it("lists a release's images in sort order with the listing projection", async () => {
      const rows = [{ id: 'a', src: 'x', caption: null, altText: null, sortOrder: 0 }];
      vi.mocked(prisma.image.findMany).mockResolvedValueOnce(rows as never);

      const result = await ImageRepository.findListingByRelease('release-1');

      expect(result).toEqual(rows);
      expect(vi.mocked(prisma.image.findMany).mock.calls).toEqual([
        [
          {
            where: { releaseId: 'release-1' },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, src: true, caption: true, altText: true, sortOrder: true },
          },
        ],
      ]);
    });
  });

  describe('updateMetadata', () => {
    it('writes caption and alt text to the image', async () => {
      vi.mocked(prisma.image.update).mockResolvedValueOnce({} as never);

      await ImageRepository.updateMetadata('img-1', { caption: 'Cap', altText: 'Alt' });

      expect(vi.mocked(prisma.image.update).mock.calls).toEqual([
        [{ where: { id: 'img-1' }, data: { caption: 'Cap', altText: 'Alt' } }],
      ]);
    });
  });

  describe('reorder', () => {
    it('assigns each image its index as sortOrder inside one transaction', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValueOnce([]);
      vi.mocked(prisma.image.update)
        .mockReturnValueOnce('update-op' as never)
        .mockReturnValueOnce('update-op' as never);

      await ImageRepository.reorder(['img-b', 'img-a']);

      expect(vi.mocked(prisma.image.update).mock.calls).toEqual([
        [{ where: { id: 'img-b' }, data: { sortOrder: 0 } }],
        [{ where: { id: 'img-a' }, data: { sortOrder: 1 } }],
      ]);
      expect(vi.mocked(prisma.$transaction).mock.calls).toEqual([[['update-op', 'update-op']]]);
    });
  });
});
