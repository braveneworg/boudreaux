/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TourDateImageRepository } from './tour-date-image-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tourDateImage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('TourDateImageRepository.findByTourDateId', () => {
  it('queries by tourDateId and orders by displayOrder ascending', async () => {
    vi.mocked(prisma.tourDateImage.findMany).mockResolvedValue([] as never);

    await TourDateImageRepository.findByTourDateId('td-1');

    expect(prisma.tourDateImage.findMany).toHaveBeenCalledWith({
      where: { tourDateId: 'td-1' },
      orderBy: { displayOrder: 'asc' },
    });
  });
});

describe('TourDateImageRepository.findById', () => {
  it('looks up by primary id', async () => {
    vi.mocked(prisma.tourDateImage.findUnique).mockResolvedValue(null);

    await TourDateImageRepository.findById('img-1');

    expect(prisma.tourDateImage.findUnique).toHaveBeenCalledWith({ where: { id: 'img-1' } });
  });
});

describe('TourDateImageRepository.createWithinCap', () => {
  const data = {
    tourDateId: 'owner-1',
    s3Key: 'media/x/owner-1/photo-1-ab.jpg',
    s3Url: 'https://cdn.example.com/media/x/owner-1/photo-1-ab.jpg',
    s3Bucket: 'bucket',
    fileName: 'photo.jpg',
    fileSize: 1024,
    mimeType: 'image/jpeg',
    altText: 'alt',
    uploadedBy: 'admin-1',
  };

  // A failing case can leave a queued transaction unconsumed; drain it so it
  // never reaches a shuffled neighbour.
  afterEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
  });

  /** A transaction client that logs each call, holding `count` images already. */
  const txHolding = (count: number, log: string[]) => ({
    tourDate: {
      update: vi.fn(async () => {
        log.push('tourDate.update');
      }),
    },
    tourDateImage: {
      count: vi.fn(async () => {
        log.push('tourDateImage.count');
        return count;
      }),
      create: vi.fn(async ({ data: row }: { data: Record<string, unknown> }) => {
        log.push('tourDateImage.create');
        return { id: 'img-new', ...row };
      }),
    },
  });

  const runIn = (tx: unknown) =>
    vi
      .mocked(prisma.$transaction)
      .mockImplementationOnce(((callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(tx))) as never);

  it('writes the tour date first, then counts, then stores the image as its last', async () => {
    const log: string[] = [];
    const tx = txHolding(3, log);
    runIn(tx);

    const row = await TourDateImageRepository.createWithinCap(data, 10);

    expect({ log, row, owner: tx.tourDate.update.mock.calls }).toEqual({
      log: ['tourDate.update', 'tourDateImage.count', 'tourDateImage.create'],
      row: { id: 'img-new', ...data, displayOrder: 3 },
      owner: [[{ where: { id: 'owner-1' }, data: { updatedAt: expect.any(Date) } }]],
    });
  });

  it('stores nothing and answers null once the tour date holds the cap', async () => {
    const log: string[] = [];
    runIn(txHolding(10, log));

    const row = await TourDateImageRepository.createWithinCap(data, 10);

    expect({ log, row }).toEqual({
      log: ['tourDate.update', 'tourDateImage.count'],
      row: null,
    });
  });

  it('runs again when it loses a write conflict to a concurrent confirm', async () => {
    const log: string[] = [];
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      Object.assign(new Error('Transaction failed due to a write conflict'), { code: 'P2034' })
    );
    runIn(txHolding(9, log));

    const row = await TourDateImageRepository.createWithinCap(data, 10);

    expect({ attempts: vi.mocked(prisma.$transaction).mock.calls.length, row }).toEqual({
      attempts: 2,
      row: { id: 'img-new', ...data, displayOrder: 9 },
    });
  });

  it('fails at once on any other error', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      Object.assign(new Error('Record to update not found'), { code: 'P2025' })
    );

    await expect(TourDateImageRepository.createWithinCap(data, 10)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(vi.mocked(prisma.$transaction).mock.calls).toHaveLength(1);
  });
});

describe('TourDateImageRepository.delete', () => {
  it('deletes by id', async () => {
    vi.mocked(prisma.tourDateImage.delete).mockResolvedValue({} as never);

    await TourDateImageRepository.delete('img-1');

    expect(prisma.tourDateImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
  });
});

describe('TourDateImageRepository.deleteByTourDateId', () => {
  it('returns the deleted count from the prisma result', async () => {
    vi.mocked(prisma.tourDateImage.deleteMany).mockResolvedValue({ count: 4 } as never);

    const result = await TourDateImageRepository.deleteByTourDateId('td-1');

    expect(result).toBe(4);
    expect(prisma.tourDateImage.deleteMany).toHaveBeenCalledWith({
      where: { tourDateId: 'td-1' },
    });
  });
});

describe('TourDateImageRepository.updateDisplayOrder', () => {
  it('updates displayOrder for a single image', async () => {
    vi.mocked(prisma.tourDateImage.update).mockResolvedValue({} as never);

    await TourDateImageRepository.updateDisplayOrder('img-1', 5);

    expect(prisma.tourDateImage.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { displayOrder: 5 },
    });
  });
});

describe('TourDateImageRepository.reorderImages', () => {
  it('runs a single $transaction with one update per supplied row', async () => {
    vi.mocked(prisma.tourDateImage.update).mockReturnValue('upd' as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    await TourDateImageRepository.reorderImages([
      { id: 'a', displayOrder: 0 },
      { id: 'b', displayOrder: 1 },
    ]);

    expect(prisma.tourDateImage.update).toHaveBeenCalledTimes(2);
    expect(prisma.tourDateImage.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { displayOrder: 0 },
    });
    expect(prisma.tourDateImage.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { displayOrder: 1 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('TourDateImageRepository.count', () => {
  it('counts rows for a given tourDateId', async () => {
    vi.mocked(prisma.tourDateImage.count).mockResolvedValue(3);

    const result = await TourDateImageRepository.count('td-1');

    expect(result).toBe(3);
    expect(prisma.tourDateImage.count).toHaveBeenCalledWith({ where: { tourDateId: 'td-1' } });
  });
});
