/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VenueRepository } from './venue-repository';
import { prisma } from '../../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../../prisma', () => ({
  prisma: {
    venue: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('VenueRepository', () => {
  const mockVenue = {
    id: 'venue-123',
    name: 'The Grand Theater',
    address: '123 Main Street',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    postalCode: '90001',
    capacity: 5000,
    notes: 'Historic venue',
    timeZone: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    createdBy: 'user-123',
    updatedBy: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all venues sorted by name', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      const result = await VenueRepository.findAll();

      expect(result).toEqual([mockVenue]);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });

    it('should apply search filter when provided', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      await VenueRepository.findAll({ search: 'Grand' });

      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'Grand', mode: 'insensitive' } }]),
          }),
        })
      );
    });

    it('should filter by city when provided', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      await VenueRepository.findAll({ city: 'Los Angeles' });

      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            city: { equals: 'Los Angeles', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should apply pagination when provided', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      await VenueRepository.findAll({ page: 2, limit: 50 });

      expect(prisma.venue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 50,
        })
      );
    });

    it('should return empty array when no venues found', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([]);

      const result = await VenueRepository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findRecent', () => {
    it('should return recent venues ordered by createdAt desc with default limit', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      const result = await VenueRepository.findRecent();

      expect(result).toEqual([mockVenue]);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });

    it('should use custom limit when provided', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      await VenueRepository.findRecent(10);

      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });
  });

  describe('findById', () => {
    it('should return venue by id', async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValue(mockVenue);

      const result = await VenueRepository.findById('venue-123');

      expect(result).toEqual(mockVenue);
      expect(prisma.venue.findUnique).toHaveBeenCalledWith({
        where: { id: 'venue-123' },
      });
    });

    it('should return null when venue not found', async () => {
      vi.mocked(prisma.venue.findUnique).mockResolvedValue(null);

      const result = await VenueRepository.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return venue by exact name match', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([mockVenue]);

      const result = await VenueRepository.findByName('The Grand Theater');

      expect(result).toEqual([mockVenue]);
      expect(prisma.venue.findMany).toHaveBeenCalledWith({
        where: {
          name: { equals: 'The Grand Theater', mode: 'insensitive' },
        },
        take: 1,
      });
    });

    it('should return empty array when no match found', async () => {
      vi.mocked(prisma.venue.findMany).mockResolvedValue([]);

      const result = await VenueRepository.findByName('Nonexistent Venue');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create venue with all fields', async () => {
      const createData = {
        name: 'New Venue',
        address: '456 Another St',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        postalCode: '94102',
        capacity: 3000,
        notes: 'Brand new venue',
        createdBy: 'user-123',
      };

      vi.mocked(prisma.venue.create).mockResolvedValue({
        ...mockVenue,
        ...createData,
        id: 'venue-456',
      });

      await VenueRepository.create(createData);

      expect(prisma.venue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Venue',
          city: 'San Francisco',
          createdBy: 'user-123',
        }),
      });
    });

    it('should create venue with only required fields', async () => {
      const createData = {
        name: 'Minimal Venue',
        city: 'Portland',
        createdBy: 'user-123',
      };

      vi.mocked(prisma.venue.create).mockResolvedValue({
        ...mockVenue,
        name: 'Minimal Venue',
        city: 'Portland',
        address: null,
        state: null,
        country: null,
        postalCode: null,
        capacity: null,
        notes: null,
      });

      await VenueRepository.create(createData);

      expect(prisma.venue.create).toHaveBeenCalledWith({
        data: {
          name: 'Minimal Venue',
          city: 'Portland',
          createdBy: 'user-123',
        },
      });
    });

    it('should throw error on duplicate venue name in same city', async () => {
      const createData = {
        name: 'The Grand Theater',
        city: 'Los Angeles',
        createdBy: 'user-123',
      };

      vi.mocked(prisma.venue.create).mockRejectedValue(new Error('Unique constraint failed'));

      await expect(VenueRepository.create(createData)).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('update', () => {
    it('should update venue fields', async () => {
      const updateData = {
        name: 'Updated Theater Name',
        capacity: 6000,
      };

      vi.mocked(prisma.venue.update).mockResolvedValue({
        ...mockVenue,
        ...updateData,
      });

      await VenueRepository.update('venue-123', updateData, 'user-123');

      expect(prisma.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-123' },
        data: expect.objectContaining({
          name: 'Updated Theater Name',
          capacity: 6000,
          updatedBy: 'user-123',
        }),
      });
    });

    it('should allow partial updates', async () => {
      const updateData = {
        notes: 'Updated notes only',
      };

      vi.mocked(prisma.venue.update).mockResolvedValue({
        ...mockVenue,
        notes: 'Updated notes only',
      });

      await VenueRepository.update('venue-123', updateData, 'user-123');

      expect(prisma.venue.update).toHaveBeenCalledWith({
        where: { id: 'venue-123' },
        data: expect.objectContaining({
          notes: 'Updated notes only',
          updatedBy: 'user-123',
        }),
      });
    });

    it('should throw error when venue not found', async () => {
      vi.mocked(prisma.venue.update).mockRejectedValue(new Error('Record not found'));

      await expect(
        VenueRepository.update('nonexistent-id', { name: 'Test' }, 'user-123')
      ).rejects.toThrow('Record not found');
    });
  });

  describe('delete', () => {
    it('should delete venue', async () => {
      vi.mocked(prisma.venue.delete).mockResolvedValue(mockVenue);

      await VenueRepository.delete('venue-123');

      expect(prisma.venue.delete).toHaveBeenCalledWith({
        where: { id: 'venue-123' },
      });
    });

    it('should throw error when venue not found', async () => {
      vi.mocked(prisma.venue.delete).mockRejectedValue(new Error('Record not found'));

      await expect(VenueRepository.delete('nonexistent-id')).rejects.toThrow('Record not found');
    });

    it('should throw error when venue has associated tours', async () => {
      vi.mocked(prisma.venue.delete).mockRejectedValue(new Error('Foreign key constraint failed'));

      await expect(VenueRepository.delete('venue-123')).rejects.toThrow(
        'Foreign key constraint failed'
      );
    });
  });

  describe('count', () => {
    it('should return total count of venues', async () => {
      vi.mocked(prisma.venue.count).mockResolvedValue(25);

      const result = await VenueRepository.count();

      expect(result).toBe(25);
      expect(prisma.venue.count).toHaveBeenCalled();
    });

    it('should apply filter when counting', async () => {
      vi.mocked(prisma.venue.count).mockResolvedValue(3);

      await VenueRepository.count({ search: 'Theater' });

      expect(prisma.venue.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ name: { contains: 'Theater', mode: 'insensitive' } }]),
        }),
      });
    });
    it('should apply city filter when counting', async () => {
      vi.mocked(prisma.venue.count).mockResolvedValue(5);

      await VenueRepository.count({ city: 'Los Angeles' });

      expect(prisma.venue.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          city: { equals: 'Los Angeles', mode: 'insensitive' },
        }),
      });
    });
  });
});
