/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TourDateRepository } from './tour-date-repository';
import { prisma } from '../../prisma';

vi.mock('server-only', () => ({}));

vi.mock('../../prisma', () => ({
  prisma: {
    tourDate: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    tourDateHeadliner: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const validObjectId = '507f1f77bcf86cd799439011';
const validObjectId2 = '507f1f77bcf86cd799439012';
const validVenueId = '507f1f77bcf86cd799439014';
const validHeadliner1 = '507f1f77bcf86cd799439015';
const validHeadliner2 = '507f1f77bcf86cd799439016';

const mockTourDate = {
  id: validObjectId,
  tourId: validObjectId2,
  venueId: validVenueId,
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: null,
  showStartTime: new Date('2026-06-01T20:00:00.000Z'),
  showEndTime: null,
  doorsOpenAt: null,
  ticketsUrl: null,
  ticketIconUrl: null,
  ticketPrices: null,
  notes: null,
  timeZone: null,
  utcOffset: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('TourDateRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── findByTourId ────────────────────────────────────────────────────────────

  describe('findByTourId', () => {
    it('returns tour dates for a valid tourId', async () => {
      vi.mocked(prisma.tourDate.findMany).mockResolvedValue([mockTourDate] as never);

      const result = await TourDateRepository.findByTourId(validObjectId2);

      expect(result).toEqual([mockTourDate]);
      expect(prisma.tourDate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tourId: validObjectId2 },
          orderBy: { startDate: 'asc' },
        })
      );
    });

    it('returns empty array for an invalid ObjectId', async () => {
      const result = await TourDateRepository.findByTourId('invalid-id');

      expect(result).toEqual([]);
      expect(prisma.tourDate.findMany).not.toHaveBeenCalled();
    });

    it('returns empty array when prisma returns nothing', async () => {
      vi.mocked(prisma.tourDate.findMany).mockResolvedValue([] as never);

      const result = await TourDateRepository.findByTourId(validObjectId);

      expect(result).toEqual([]);
    });
  });

  // ─── findById ────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns a tour date by valid id', async () => {
      vi.mocked(prisma.tourDate.findUnique).mockResolvedValue(mockTourDate as never);

      const result = await TourDateRepository.findById(validObjectId);

      expect(result).toEqual(mockTourDate);
      expect(prisma.tourDate.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: validObjectId } })
      );
    });

    it('returns null for an invalid ObjectId', async () => {
      const result = await TourDateRepository.findById('not-valid');

      expect(result).toBeNull();
      expect(prisma.tourDate.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when prisma returns null', async () => {
      vi.mocked(prisma.tourDate.findUnique).mockResolvedValue(null);

      const result = await TourDateRepository.findById(validObjectId);

      expect(result).toBeNull();
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseCreateData = {
      tourId: validObjectId2,
      venueId: validVenueId,
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      showStartTime: new Date('2026-06-01T20:00:00.000Z'),
      headlinerIds: [validHeadliner1],
    };

    it('creates a tour date and passes timeZone to prisma', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 1 } as never);

      await TourDateRepository.create({ ...baseCreateData, timeZone: 'America/Chicago' });

      expect(prisma.tourDate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timeZone: 'America/Chicago' }),
        })
      );
    });

    it('creates a tour date and passes utcOffset to prisma', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 1 } as never);

      await TourDateRepository.create({ ...baseCreateData, utcOffset: -300 });

      expect(prisma.tourDate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ utcOffset: -300 }),
        })
      );
    });

    it('creates a tour date without timeZone/utcOffset when not provided', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 1 } as never);

      await TourDateRepository.create(baseCreateData);

      expect(prisma.tourDate.create).toHaveBeenCalled();
    });

    it('creates headliner records in order', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 2 } as never);

      await TourDateRepository.create({
        ...baseCreateData,
        headlinerIds: [validHeadliner1, validHeadliner2],
      });

      expect(prisma.tourDateHeadliner.createMany).toHaveBeenCalledWith({
        data: [
          { tourDateId: mockTourDate.id, artistId: validHeadliner1, sortOrder: 0 },
          { tourDateId: mockTourDate.id, artistId: validHeadliner2, sortOrder: 1 },
        ],
      });
    });

    it('skips createMany when headlinerIds is empty', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.create({ ...baseCreateData, headlinerIds: [] });

      expect(prisma.tourDateHeadliner.createMany).not.toHaveBeenCalled();
    });

    it('connects venue and tour via relation syntax', async () => {
      vi.mocked(prisma.tourDate.create).mockResolvedValue(mockTourDate as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 1 } as never);

      await TourDateRepository.create(baseCreateData);

      expect(prisma.tourDate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tour: { connect: { id: validObjectId2 } },
            venue: { connect: { id: validVenueId } },
          }),
        })
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('includes timeZone in update when explicitly provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { timeZone: 'Europe/London' });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timeZone: 'Europe/London' }),
        })
      );
    });

    it('includes null timeZone in update to clear the field', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { timeZone: null });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ timeZone: null }),
        })
      );
    });

    it('omits timeZone from update when undefined (no-update intent)', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      // Pass an object without timeZone key at all
      await TourDateRepository.update(validObjectId, { notes: 'updated' });

      const callArg = vi.mocked(prisma.tourDate.update).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(callArg.data).not.toHaveProperty('timeZone');
    });

    it('includes utcOffset in update when explicitly provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { utcOffset: -360 });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ utcOffset: -360 }),
        })
      );
    });

    it('includes null utcOffset in update to clear the field', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { utcOffset: null });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ utcOffset: null }),
        })
      );
    });

    it('omits utcOffset from update when undefined (no-update intent)', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { notes: 'updated' });

      const callArg = vi.mocked(prisma.tourDate.update).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(callArg.data).not.toHaveProperty('utcOffset');
    });

    it('replaces headliners when headlinerIds are provided', async () => {
      vi.mocked(prisma.tourDateHeadliner.deleteMany).mockResolvedValue({ count: 1 } as never);
      vi.mocked(prisma.tourDateHeadliner.createMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, {
        headlinerIds: [validHeadliner1, validHeadliner2],
      });

      expect(prisma.tourDateHeadliner.deleteMany).toHaveBeenCalledWith({
        where: { tourDateId: validObjectId },
      });
      expect(prisma.tourDateHeadliner.createMany).toHaveBeenCalledWith({
        data: [
          { tourDateId: validObjectId, artistId: validHeadliner1, sortOrder: 0 },
          { tourDateId: validObjectId, artistId: validHeadliner2, sortOrder: 1 },
        ],
      });
    });

    it('does not touch headliners when headlinerIds is not provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { notes: 'no headliner change' });

      expect(prisma.tourDateHeadliner.deleteMany).not.toHaveBeenCalled();
      expect(prisma.tourDateHeadliner.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a tour date by id', async () => {
      vi.mocked(prisma.tourDate.delete).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.delete(validObjectId);

      expect(prisma.tourDate.delete).toHaveBeenCalledWith({ where: { id: validObjectId } });
    });

    it('throws when prisma throws', async () => {
      vi.mocked(prisma.tourDate.delete).mockRejectedValue(new Error('Not found'));

      await expect(TourDateRepository.delete(validObjectId)).rejects.toThrow('Not found');
    });
  });

  // ─── countByTourId ───────────────────────────────────────────────────────────

  describe('countByTourId', () => {
    it('returns count for a valid tourId', async () => {
      vi.mocked(prisma.tourDate.count).mockResolvedValue(3);

      const result = await TourDateRepository.countByTourId(validObjectId);

      expect(result).toBe(3);
      expect(prisma.tourDate.count).toHaveBeenCalledWith({ where: { tourId: validObjectId } });
    });

    it('returns 0 for an invalid ObjectId without querying', async () => {
      const result = await TourDateRepository.countByTourId('bad-id');

      expect(result).toBe(0);
      expect(prisma.tourDate.count).not.toHaveBeenCalled();
    });
  });

  // ─── findUpcoming ────────────────────────────────────────────────────────────

  describe('findUpcoming', () => {
    it('queries for tour dates with startDate >= now', async () => {
      vi.mocked(prisma.tourDate.findMany).mockResolvedValue([mockTourDate] as never);

      const result = await TourDateRepository.findUpcoming();

      expect(result).toEqual([mockTourDate]);
      expect(prisma.tourDate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { startDate: { gte: expect.any(Date) } },
          orderBy: { startDate: 'asc' },
        })
      );
    });

    it('applies limit when provided', async () => {
      vi.mocked(prisma.tourDate.findMany).mockResolvedValue([mockTourDate] as never);

      await TourDateRepository.findUpcoming(5);

      expect(prisma.tourDate.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  // ─── updateHeadlinerSetTime ──────────────────────────────────────────────────

  describe('updateHeadlinerSetTime', () => {
    it('calls prisma.tourDateHeadliner.update with the provided date', async () => {
      vi.mocked(prisma.tourDateHeadliner.update).mockResolvedValue({} as never);
      const setTime = new Date('2026-06-01T21:00:00.000Z');

      await TourDateRepository.updateHeadlinerSetTime(validHeadliner1, setTime);

      expect(prisma.tourDateHeadliner.update).toHaveBeenCalledWith({
        where: { id: validHeadliner1 },
        data: { setTime },
      });
    });

    it('calls prisma.tourDateHeadliner.update with null to clear the time', async () => {
      vi.mocked(prisma.tourDateHeadliner.update).mockResolvedValue({} as never);

      await TourDateRepository.updateHeadlinerSetTime(validHeadliner1, null);

      expect(prisma.tourDateHeadliner.update).toHaveBeenCalledWith({
        where: { id: validHeadliner1 },
        data: { setTime: null },
      });
    });
  });

  // ─── removeHeadliner ─────────────────────────────────────────────────────────

  describe('removeHeadliner', () => {
    it('calls prisma.tourDateHeadliner.delete with the headliner id', async () => {
      vi.mocked(prisma.tourDateHeadliner.delete).mockResolvedValue({} as never);

      await TourDateRepository.removeHeadliner(validHeadliner1);

      expect(prisma.tourDateHeadliner.delete).toHaveBeenCalledWith({
        where: { id: validHeadliner1 },
      });
    });

    it('throws when prisma throws', async () => {
      vi.mocked(prisma.tourDateHeadliner.delete).mockRejectedValue(new Error('Not found'));

      await expect(TourDateRepository.removeHeadliner(validHeadliner1)).rejects.toThrow(
        'Not found'
      );
    });
  });

  // ─── reorderHeadliners ───────────────────────────────────────────────────────

  describe('reorderHeadliners', () => {
    it('calls prisma.$transaction with an update operation for each headliner id', async () => {
      vi.mocked(prisma.tourDateHeadliner.update).mockResolvedValue({} as never);
      vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

      await TourDateRepository.reorderHeadliners(validObjectId, [validHeadliner1, validHeadliner2]);

      expect(prisma.tourDateHeadliner.update).toHaveBeenCalledTimes(2);
      expect(prisma.tourDateHeadliner.update).toHaveBeenNthCalledWith(1, {
        where: { id: validHeadliner1 },
        data: { sortOrder: 0 },
      });
      expect(prisma.tourDateHeadliner.update).toHaveBeenNthCalledWith(2, {
        where: { id: validHeadliner2 },
        data: { sortOrder: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('calls prisma.$transaction with an empty array when headlinerIds is empty', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

      await TourDateRepository.reorderHeadliners(validObjectId, []);

      expect(prisma.$transaction).toHaveBeenCalledWith([]);
      expect(prisma.tourDateHeadliner.update).not.toHaveBeenCalled();
    });
  });

  // ─── update - additional branch coverage ─────────────────────────────────────

  describe('update - additional branch coverage', () => {
    it('includes startDate in update when explicitly provided as a value', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);
      const newStartDate = new Date('2026-07-01T00:00:00.000Z');

      await TourDateRepository.update(validObjectId, { startDate: newStartDate });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startDate: newStartDate }),
        })
      );
    });

    it('connects venue relation when venueId is provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { venueId: validVenueId });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            venue: { connect: { id: validVenueId } },
          }),
        })
      );
    });

    it('deletes all headliners and skips createMany when headlinerIds is empty array', async () => {
      vi.mocked(prisma.tourDateHeadliner.deleteMany).mockResolvedValue({ count: 2 } as never);
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { headlinerIds: [] });

      expect(prisma.tourDateHeadliner.deleteMany).toHaveBeenCalledWith({
        where: { tourDateId: validObjectId },
      });
      expect(prisma.tourDateHeadliner.createMany).not.toHaveBeenCalled();
    });

    it('includes ticketsUrl in update when explicitly provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { ticketsUrl: 'https://tickets.example.com' });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ticketsUrl: 'https://tickets.example.com' }),
        })
      );
    });

    it('includes notes in update when explicitly provided', async () => {
      vi.mocked(prisma.tourDate.update).mockResolvedValue(mockTourDate as never);

      await TourDateRepository.update(validObjectId, { notes: 'Special event notes' });

      expect(prisma.tourDate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: 'Special event notes' }),
        })
      );
    });
  });
});
