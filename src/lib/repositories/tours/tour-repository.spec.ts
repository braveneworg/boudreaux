/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TourRepository } from './tour-repository';
import { prisma } from '../../prisma';

vi.mock('server-only', () => ({}));

vi.mock('../../prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    tour: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('TourRepository', () => {
  const mockTour = {
    id: 'tour-123',
    title: 'Summer Tour 2026',
    subtitle: 'West Coast Edition',
    subtitle2: null,
    description: 'An incredible summer tour',
    notes: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    createdBy: 'user-123',
    updatedBy: null,
    images: [],
    tourDates: [],
  };
  describe('findAll', () => {
    it('returns tours sorted by createdAt descending with nested relations', async () => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([mockTour] as never);

      const result = await TourRepository.findAll();

      expect(result).toEqual([mockTour]);
      expect(prisma.tour.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { displayOrder: 'asc' },
          },
          tourDates: {
            include: {
              venue: true,
              headliners: {
                include: {
                  artist: true,
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { startDate: 'asc' },
          },
        },
      });
    });

    it('applies search and pagination', async () => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([mockTour] as never);

      await TourRepository.findAll({ search: 'Summer', page: 2, limit: 25 });

      expect(prisma.tour.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
          where: {
            OR: [
              { title: { contains: 'Summer', mode: 'insensitive' } },
              { subtitle: { contains: 'Summer', mode: 'insensitive' } },
              { description: { contains: 'Summer', mode: 'insensitive' } },
            ],
          },
        })
      );
    });
  });

  describe('findById', () => {
    it('returns one tour with nested relations', async () => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValue(mockTour as never);

      const validTourId = '507f1f77bcf86cd799439011';

      const result = await TourRepository.findById(validTourId);

      expect(result).toEqual(mockTour);
      expect(prisma.tour.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: validTourId } })
      );
    });

    it('returns null when missing', async () => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValue(null);

      const result = await TourRepository.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a tour with basic fields only', async () => {
      const createData = {
        title: 'New Tour',
        subtitle: 'Subtitle',
        subtitle2: null,
        description: 'Description',
        notes: 'Internal note',
        createdBy: 'user-123',
      };

      vi.mocked(prisma.tour.create).mockResolvedValue(mockTour as never);

      const result = await TourRepository.create(createData);

      expect(result).toEqual(mockTour);
      expect(prisma.tour.create).toHaveBeenCalledWith({
        data: createData,
      });
    });
  });

  describe('update', () => {
    it('updates fields and sets updatedBy', async () => {
      const updateData = {
        title: 'Updated Title',
        subtitle: 'Updated Subtitle',
      };

      vi.mocked(prisma.tour.update).mockResolvedValue({
        ...mockTour,
        ...updateData,
      } as never);

      await TourRepository.update('tour-123', updateData, 'user-456');

      expect(prisma.tour.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tour-123' },
          data: {
            ...updateData,
            updatedBy: 'user-456',
          },
        })
      );
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      const tx = {
        tourDateHeadliner: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tourDate: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tourImage: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tour: {
          delete: vi.fn().mockResolvedValue(mockTour),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await TourRepository.delete('tour-123');

      expect(tx.tourDateHeadliner.deleteMany).toHaveBeenCalledWith({
        where: {
          tourDate: {
            tourId: 'tour-123',
          },
        },
      });
      expect(tx.tourDate.deleteMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-123' },
      });
      expect(tx.tourImage.deleteMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-123' },
      });
      expect(tx.tour.delete).toHaveBeenCalledWith({
        where: { id: 'tour-123' },
      });
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      vi.mocked(prisma.tour.count).mockResolvedValue(42);

      const result = await TourRepository.count();

      expect(result).toBe(42);
      expect(prisma.tour.count).toHaveBeenCalledWith({ where: {} });
    });

    it('applies search filter when counting', async () => {
      vi.mocked(prisma.tour.count).mockResolvedValue(5);

      await TourRepository.count({ search: 'Summer' });

      expect(prisma.tour.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: 'Summer', mode: 'insensitive' } },
            { subtitle: { contains: 'Summer', mode: 'insensitive' } },
            { description: { contains: 'Summer', mode: 'insensitive' } },
          ],
        },
      });
    });
  });
});
