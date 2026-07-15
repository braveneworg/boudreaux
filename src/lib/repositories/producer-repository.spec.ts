/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { ProducerRepository } from './producer-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const producer = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  const videoProducer = { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() };
  return {
    prisma: {
      producer,
      videoProducer,
      $transaction: vi.fn(
        async (fn: (tx: { videoProducer: typeof videoProducer }) => Promise<unknown>) =>
          fn({ videoProducer })
      ),
    },
  };
});

const VIDEO_ID = 'v'.repeat(24);
const PRODUCER_ID_1 = 'p'.repeat(24);
const PRODUCER_ID_2 = 'q'.repeat(24);

describe('ProducerRepository', () => {
  describe('search', () => {
    it('filters by case-insensitive name contains, ordered asc with a take limit', async () => {
      vi.mocked(prisma.producer.findMany).mockResolvedValue([
        { id: PRODUCER_ID_1, name: 'Rick Rubin' },
      ] as never);

      const result = await ProducerRepository.search('rick', 10);

      expect(prisma.producer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { contains: 'rick', mode: 'insensitive' } },
          orderBy: { name: 'asc' },
          take: 10,
        })
      );
      expect(result).toEqual([{ id: PRODUCER_ID_1, name: 'Rick Rubin' }]);
    });
  });

  describe('findOrCreateByName', () => {
    it('returns an existing producer without creating when name matches', async () => {
      vi.mocked(prisma.producer.findFirst).mockResolvedValue({
        id: PRODUCER_ID_1,
        name: 'Rick',
      } as never);

      const result = await ProducerRepository.findOrCreateByName('Rick');

      expect(prisma.producer.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: PRODUCER_ID_1, name: 'Rick' });
    });

    it('creates a producer when no match exists', async () => {
      vi.mocked(prisma.producer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.producer.create).mockResolvedValue({
        id: PRODUCER_ID_2,
        name: 'New Producer',
      } as never);

      const result = await ProducerRepository.findOrCreateByName('New Producer', 'user1');

      expect(prisma.producer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'New Producer', createdBy: 'user1' }),
        })
      );
      expect(result.id).toBe(PRODUCER_ID_2);
    });

    it('trims whitespace before searching and creating', async () => {
      vi.mocked(prisma.producer.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.producer.create).mockResolvedValue({
        id: PRODUCER_ID_2,
        name: 'Trimmed',
      } as never);

      await ProducerRepository.findOrCreateByName('  Trimmed  ');

      expect(prisma.producer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: { equals: 'Trimmed', mode: 'insensitive' } },
        })
      );
      expect(prisma.producer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Trimmed' }),
        })
      );
    });

    it('recovers from a duplicate-name race by re-finding the winner', async () => {
      vi.mocked(prisma.producer.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: PRODUCER_ID_1, name: 'Race Producer' } as never);
      vi.mocked(prisma.producer.create).mockRejectedValue(
        Object.assign(new Error('unique'), { code: 'P2002' })
      );

      const result = await ProducerRepository.findOrCreateByName('Race Producer');

      expect(result).toEqual({ id: PRODUCER_ID_1, name: 'Race Producer' });
    });

    it('throws when create fails and the recovery re-find yields nothing', async () => {
      vi.mocked(prisma.producer.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      vi.mocked(prisma.producer.create).mockRejectedValue(new Error('boom'));

      await expect(ProducerRepository.findOrCreateByName('Ghost')).rejects.toThrow(
        'Failed to create producer "Ghost"'
      );
    });
  });

  describe('replaceForVideo', () => {
    it('deletes prior joins then inserts dense-ordered rows inside a transaction', async () => {
      vi.mocked(prisma.videoProducer.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.videoProducer.createMany).mockResolvedValue({ count: 2 });

      await ProducerRepository.replaceForVideo(VIDEO_ID, [PRODUCER_ID_1, PRODUCER_ID_2]);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.videoProducer.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
      });
      expect(prisma.videoProducer.createMany).toHaveBeenCalledWith({
        data: [
          { videoId: VIDEO_ID, producerId: PRODUCER_ID_1, sortOrder: 0 },
          { videoId: VIDEO_ID, producerId: PRODUCER_ID_2, sortOrder: 1 },
        ],
      });
    });

    it('skips createMany for an empty producerIds array', async () => {
      vi.mocked(prisma.videoProducer.deleteMany).mockResolvedValue({ count: 1 });

      await ProducerRepository.replaceForVideo(VIDEO_ID, []);

      expect(prisma.videoProducer.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
      });
      expect(prisma.videoProducer.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findByVideoId', () => {
    it('returns producer summaries ordered by sortOrder', async () => {
      vi.mocked(prisma.videoProducer.findMany).mockResolvedValue([
        { producer: { id: PRODUCER_ID_1, name: 'Rick Rubin' } },
        { producer: { id: PRODUCER_ID_2, name: 'Quincy Jones' } },
      ] as never);

      const result = await ProducerRepository.findByVideoId(VIDEO_ID);

      expect(prisma.videoProducer.findMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
        orderBy: { sortOrder: 'asc' },
        select: { producer: { select: { id: true, name: true } } },
      });
      expect(result).toEqual([
        { id: PRODUCER_ID_1, name: 'Rick Rubin' },
        { id: PRODUCER_ID_2, name: 'Quincy Jones' },
      ]);
    });
  });
});
