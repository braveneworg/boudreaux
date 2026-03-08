/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VenueRepository } from '@/lib/repositories/tours/venue-repository';
import type { VenueCreateInput } from '@/lib/validations/tours/venue-schema';

import { VenueService } from './venue-service';

// Mock server-only
vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/tours/venue-repository', () => ({
  VenueRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
}));

describe('VenueService', () => {
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
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    createdBy: 'user-123',
    updatedBy: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated venues', async () => {
      vi.mocked(VenueRepository.findAll).mockResolvedValue([mockVenue]);
      vi.mocked(VenueRepository.count).mockResolvedValue(1);

      const result = await VenueService.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(mockVenue);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('should apply search filter', async () => {
      vi.mocked(VenueRepository.findAll).mockResolvedValue([mockVenue]);
      vi.mocked(VenueRepository.count).mockResolvedValue(1);

      await VenueService.findAll({ search: 'Grand' });

      expect(VenueRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Grand',
        })
      );
    });

    it('should apply city filter', async () => {
      vi.mocked(VenueRepository.findAll).mockResolvedValue([mockVenue]);
      vi.mocked(VenueRepository.count).mockResolvedValue(1);

      await VenueService.findAll({ city: 'Los Angeles' });

      expect(VenueRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Los Angeles',
        })
      );
    });

    it('should apply pagination parameters', async () => {
      vi.mocked(VenueRepository.findAll).mockResolvedValue([mockVenue]);
      vi.mocked(VenueRepository.count).mockResolvedValue(50);

      const result = await VenueService.findAll({ page: 3, limit: 25 });

      expect(VenueRepository.findAll).toHaveBeenCalledWith({
        page: 3,
        limit: 25,
      });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(25);
    });

    it('should return empty results when no venues found', async () => {
      vi.mocked(VenueRepository.findAll).mockResolvedValue([]);
      vi.mocked(VenueRepository.count).mockResolvedValue(0);

      const result = await VenueService.findAll();

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return venue by id', async () => {
      vi.mocked(VenueRepository.findById).mockResolvedValue(mockVenue);

      const result = await VenueService.findById('venue-123');

      expect(result).toEqual(mockVenue);
      expect(VenueRepository.findById).toHaveBeenCalledWith('venue-123');
    });

    it('should return null when venue not found', async () => {
      vi.mocked(VenueRepository.findById).mockResolvedValue(null);

      const result = await VenueService.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByName', () => {
    it('should return venues matching name', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([mockVenue]);

      const result = await VenueService.findByName('The Grand Theater');

      expect(result).toEqual([mockVenue]);
      expect(VenueRepository.findByName).toHaveBeenCalledWith('The Grand Theater');
    });

    it('should return empty array when no match', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([]);

      const result = await VenueService.findByName('Nonexistent Venue');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    const validCreateInput = {
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

    it('should validate input and create venue', async () => {
      vi.mocked(VenueRepository.create).mockResolvedValue({
        ...mockVenue,
        ...validCreateInput,
        id: 'venue-456',
      });

      const result = await VenueService.create(validCreateInput);

      expect(VenueRepository.create).toHaveBeenCalledWith(validCreateInput);
      expect(result.name).toBe('New Venue');
      expect(result.city).toBe('San Francisco');
    });

    it('should accept minimal valid input (only required fields)', async () => {
      const minimalInput = {
        name: 'Minimal Venue',
        city: 'Portland',
        createdBy: 'user-123',
      };

      vi.mocked(VenueRepository.create).mockResolvedValue({
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

      await VenueService.create(minimalInput);

      expect(VenueRepository.create).toHaveBeenCalledWith(minimalInput);
    });

    it('should reject invalid input - missing required name', async () => {
      const invalidInput = {
        city: 'Test City',
        createdBy: 'user-123',
      };

      await expect(
        VenueService.create(invalidInput as unknown as VenueCreateInput)
      ).rejects.toThrow();
    });

    it('should reject invalid input - missing required city', async () => {
      const invalidInput = {
        name: 'Test Venue',
        createdBy: 'user-123',
      };

      await expect(
        VenueService.create(invalidInput as unknown as VenueCreateInput)
      ).rejects.toThrow();
    });

    it('should reject invalid input - name too long', async () => {
      const invalidInput = {
        ...validCreateInput,
        name: 'x'.repeat(256),
      };

      await expect(VenueService.create(invalidInput)).rejects.toThrow();
    });

    it('should reject invalid input - negative capacity', async () => {
      const invalidInput = {
        ...validCreateInput,
        capacity: -100,
      };

      await expect(VenueService.create(invalidInput)).rejects.toThrow();
    });

    it('should reject invalid input - zero capacity', async () => {
      const invalidInput = {
        ...validCreateInput,
        capacity: 0,
      };

      await expect(VenueService.create(invalidInput)).rejects.toThrow();
    });

    it('should throw error when repository throws (duplicate venue)', async () => {
      vi.mocked(VenueRepository.create).mockRejectedValue(new Error('Unique constraint failed'));

      await expect(VenueService.create(validCreateInput)).rejects.toThrow(
        'Unique constraint failed'
      );
    });
  });

  describe('update', () => {
    const validUpdateInput = {
      name: 'Updated Venue Name',
      capacity: 6000,
    };

    it('should validate input and update venue', async () => {
      vi.mocked(VenueRepository.update).mockResolvedValue({
        ...mockVenue,
        ...validUpdateInput,
      });

      const result = await VenueService.update('venue-123', validUpdateInput, 'user-123');

      expect(VenueRepository.update).toHaveBeenCalledWith(
        'venue-123',
        validUpdateInput,
        'user-123'
      );
      expect(result.name).toBe('Updated Venue Name');
      expect(result.capacity).toBe(6000);
    });

    it('should allow partial updates', async () => {
      const partialInput = {
        notes: 'Updated notes only',
      };

      vi.mocked(VenueRepository.update).mockResolvedValue({
        ...mockVenue,
        notes: 'Updated notes only',
      });

      await VenueService.update('venue-123', partialInput, 'user-123');

      expect(VenueRepository.update).toHaveBeenCalledWith('venue-123', partialInput, 'user-123');
    });

    it('should reject invalid input - name too long', async () => {
      const invalidInput = {
        name: 'x'.repeat(256),
      };

      await expect(VenueService.update('venue-123', invalidInput, 'user-123')).rejects.toThrow();
    });

    it('should reject invalid input - negative capacity', async () => {
      const invalidInput = {
        capacity: -500,
      };

      await expect(VenueService.update('venue-123', invalidInput, 'user-123')).rejects.toThrow();
    });

    it('should throw error when venue not found', async () => {
      vi.mocked(VenueRepository.update).mockRejectedValue(new Error('Record not found'));

      await expect(
        VenueService.update('nonexistent-id', validUpdateInput, 'user-123')
      ).rejects.toThrow('Record not found');
    });
  });

  describe('delete', () => {
    it('should delete venue', async () => {
      vi.mocked(VenueRepository.delete).mockResolvedValue(mockVenue);

      await VenueService.delete('venue-123');

      expect(VenueRepository.delete).toHaveBeenCalledWith('venue-123');
    });

    it('should throw error when venue not found', async () => {
      vi.mocked(VenueRepository.delete).mockRejectedValue(new Error('Record not found'));

      await expect(VenueService.delete('nonexistent-id')).rejects.toThrow('Record not found');
    });

    it('should throw error when venue has associated tours', async () => {
      vi.mocked(VenueRepository.delete).mockRejectedValue(
        new Error('Foreign key constraint failed')
      );

      await expect(VenueService.delete('venue-123')).rejects.toThrow(
        'Foreign key constraint failed'
      );
    });
  });

  describe('checkDuplicateName', () => {
    it('should return true when venue name exists in city', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([
        {
          ...mockVenue,
          city: 'Los Angeles',
        },
      ]);

      const result = await VenueService.checkDuplicateName('The Grand Theater', 'Los Angeles');

      expect(result).toBe(true);
    });

    it('should return false when venue name exists but in different city', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([
        {
          ...mockVenue,
          city: 'New York',
        },
      ]);

      const result = await VenueService.checkDuplicateName('The Grand Theater', 'Los Angeles');

      expect(result).toBe(false);
    });

    it('should return false when venue name does not exist', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([]);

      const result = await VenueService.checkDuplicateName('Nonexistent Venue', 'Los Angeles');

      expect(result).toBe(false);
    });

    it('should exclude specified venue id when checking (for updates)', async () => {
      vi.mocked(VenueRepository.findByName).mockResolvedValue([
        {
          ...mockVenue,
          id: 'venue-123',
          city: 'Los Angeles',
        },
      ]);

      const result = await VenueService.checkDuplicateName(
        'The Grand Theater',
        'Los Angeles',
        'venue-123'
      );

      expect(result).toBe(false);
    });
  });
});
