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

describe('TourDateImageRepository.create', () => {
  it('persists the supplied data fields verbatim', async () => {
    vi.mocked(prisma.tourDateImage.create).mockResolvedValue({ id: 'img-1' } as never);

    const data = {
      tourDateId: 'td-1',
      s3Key: 'key',
      s3Url: 'https://cdn.example.com/key',
      s3Bucket: 'bucket',
      fileName: 'photo.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
      displayOrder: 0,
      altText: 'alt',
      uploadedBy: 'admin-1',
    };

    await TourDateImageRepository.create(data);

    expect(prisma.tourDateImage.create).toHaveBeenCalledWith({ data });
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

describe('TourDateImageRepository.updateAltText', () => {
  it('updates altText to a string value', async () => {
    vi.mocked(prisma.tourDateImage.update).mockResolvedValue({} as never);

    await TourDateImageRepository.updateAltText('img-1', 'new alt');

    expect(prisma.tourDateImage.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { altText: 'new alt' },
    });
  });

  it('clears altText when null is supplied', async () => {
    vi.mocked(prisma.tourDateImage.update).mockResolvedValue({} as never);

    await TourDateImageRepository.updateAltText('img-1', null);

    expect(prisma.tourDateImage.update).toHaveBeenCalledWith({
      where: { id: 'img-1' },
      data: { altText: null },
    });
  });
});
