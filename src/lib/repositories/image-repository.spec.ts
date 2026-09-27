/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ImageRepository } from './image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    image: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
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
});
