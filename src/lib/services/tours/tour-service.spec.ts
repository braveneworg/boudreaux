/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TourRepository } from '@/lib/repositories/tours/tour-repository';

import { TourService } from './tour-service';

// Mock server-only
vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
}));

describe('TourService', () => {
  const mockTour = {
    id: 'tour-123',
    title: 'Summer Tour 2026',
    subtitle: 'North American Leg',
    subtitle2: null,
    description: 'Epic tour description',
    notes: null,
    createdBy: 'user-123',
    updatedBy: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    tourDates: [
      {
        id: 'td-1',
        tourId: 'tour-123',
        venueId: 'venue-123',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-01'),
        showStartTime: new Date('2026-06-01T19:00:00'),
        showEndTime: new Date('2026-06-01T23:00:00'),
        ticketsUrl: 'https://tickets.example.com/tour-123',
        ticketPrices: 'GA: $50, VIP: $150',
        notes: null,
        createdAt: new Date('2026-03-01'),
        updatedAt: new Date('2026-03-01'),
        venue: {
          id: 'venue-123',
          name: 'The Grand Theater',
          city: 'Los Angeles',
          state: 'CA',
          country: 'USA',
          address: '123 Main St',
          postalCode: '90001',
          capacity: 5000,
          notes: null,
          createdBy: 'user-123',
          updatedBy: null,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
        },
        headliners: [
          {
            id: 'th-1',
            tourDateId: 'td-1',
            artistId: 'artist-1',
            sortOrder: 0,
            createdAt: new Date('2026-03-01'),
            artist: {
              id: 'artist-1',
              firstName: 'John',
              surname: 'Doe',
              displayName: 'JDoe',
              middleName: null,
              akaNames: null,
              title: null,
              suffix: null,
              phone: null,
              email: null,
              address1: null,
              address2: null,
              city: null,
              state: null,
              postalCode: null,
              country: null,
              bio: null,
              shortBio: null,
              altBio: null,
              slug: 'john-doe',
              genres: null,
              bornOn: null,
              diedOn: null,
              publishedOn: null,
              publishedBy: null,
              createdAt: new Date('2026-03-01'),
              createdBy: null,
              updatedAt: null,
              updatedBy: null,
              deletedOn: null,
              deletedBy: null,
              deactivatedAt: null,
              deactivatedBy: null,
              reactivatedAt: null,
              reactivatedBy: null,
              notes: [],
              tags: null,
              isPseudonymous: false,
              isActive: true,
              instruments: null,
              featuredArtistId: null,
              trackId: null,
            },
          },
        ],
      },
    ],
    images: [],
  };
  describe('findAll', () => {
    it('should return paginated tours with artist display names', async () => {
      vi.mocked(TourRepository.findAll).mockResolvedValue([mockTour] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].displayHeadliners).toEqual(['JDoe']);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('should apply search filter', async () => {
      vi.mocked(TourRepository.findAll).mockResolvedValue([mockTour] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      await TourService.findAll({ search: 'Summer' });

      expect(TourRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Summer',
        })
      );
    });

    it('should apply pagination parameters', async () => {
      vi.mocked(TourRepository.findAll).mockResolvedValue([mockTour] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(50);

      const result = await TourService.findAll({ page: 2, limit: 20 });

      expect(TourRepository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 20,
      });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
    });

    it('should handle artist display name fallback when stageName missing', async () => {
      const tourWithoutStageName = {
        ...mockTour,
        tourDates: [
          {
            ...mockTour.tourDates[0],
            headliners: [
              {
                ...mockTour.tourDates[0].headliners[0],
                artist: {
                  ...mockTour.tourDates[0].headliners[0].artist,
                  firstName: 'John',
                  surname: 'Doe',
                  displayName: null,
                },
              },
            ],
          },
        ],
      };

      vi.mocked(TourRepository.findAll).mockResolvedValue([tourWithoutStageName] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data[0].displayHeadliners).toEqual(['John Doe']);
    });

    it('should handle artist with only firstName', async () => {
      const tourWithFirstNameOnly = {
        ...mockTour,
        tourDates: [
          {
            ...mockTour.tourDates[0],
            headliners: [
              {
                ...mockTour.tourDates[0].headliners[0],
                artist: {
                  ...mockTour.tourDates[0].headliners[0].artist,
                  firstName: 'Prince',
                  surname: null,
                  displayName: null,
                },
              },
            ],
          },
        ],
      };

      vi.mocked(TourRepository.findAll).mockResolvedValue([tourWithFirstNameOnly] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data[0].displayHeadliners).toEqual(['Prince']);
    });

    it('should handle artist with only surname', async () => {
      const tourWithSurnameOnly = {
        ...mockTour,
        tourDates: [
          {
            ...mockTour.tourDates[0],
            headliners: [
              {
                ...mockTour.tourDates[0].headliners[0],
                artist: {
                  ...mockTour.tourDates[0].headliners[0].artist,
                  firstName: null,
                  surname: 'Madonna',
                  displayName: null,
                },
              },
            ],
          },
        ],
      };

      vi.mocked(TourRepository.findAll).mockResolvedValue([tourWithSurnameOnly] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data[0].displayHeadliners).toEqual(['Madonna']);
    });

    it('should filter out headliners with no resolved name', async () => {
      const tourWithNoNames = {
        ...mockTour,
        tourDates: [
          {
            ...mockTour.tourDates[0],
            headliners: [
              {
                ...mockTour.tourDates[0].headliners[0],
                artist: {
                  ...mockTour.tourDates[0].headliners[0].artist,
                  firstName: null,
                  surname: null,
                  displayName: null,
                },
              },
            ],
          },
        ],
      };

      vi.mocked(TourRepository.findAll).mockResolvedValue([tourWithNoNames] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data[0].displayHeadliners).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return tour with display names', async () => {
      vi.mocked(TourRepository.findById).mockResolvedValue(mockTour as never);

      const result = await TourService.findById('tour-123');

      expect(result).toBeTruthy();
      expect(result?.displayHeadliners).toEqual(['JDoe']);
    });

    it('should return null when tour not found', async () => {
      vi.mocked(TourRepository.findById).mockResolvedValue(null);

      const result = await TourService.findById('nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return empty displayHeadliners when tour has no tourDates property', async () => {
      const tourWithoutTourDates = {
        id: 'tour-123',
        title: 'Minimal Tour',
        subtitle: null,
        subtitle2: null,
        description: null,
        notes: null,
        createdBy: 'user-123',
        updatedBy: null,
        createdAt: new Date('2026-03-01'),
        updatedAt: new Date('2026-03-01'),
        images: [],
      };

      vi.mocked(TourRepository.findById).mockResolvedValue(tourWithoutTourDates as never);

      const result = await TourService.findById('tour-123');

      expect(result).toBeTruthy();
      expect(result?.displayHeadliners).toEqual([]);
    });
  });

  describe('create', () => {
    const validCreateInput = {
      title: 'New Tour',
      subtitle: 'Subtitle',
      description: 'Description',
      createdBy: 'user-123',
    };

    it('should validate input and create tour', async () => {
      vi.mocked(TourRepository.create).mockResolvedValue(mockTour);

      const result = await TourService.create(validCreateInput);

      expect(TourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Tour',
          createdBy: 'user-123',
        })
      );
      expect(result.displayHeadliners).toBeDefined();
    });

    it('should accept title-only create payload', async () => {
      const minimalTitleOnly = {
        title: 'Title Only Tour',
      };

      vi.mocked(TourRepository.create).mockResolvedValue(mockTour);

      await TourService.create(minimalTitleOnly);

      expect(TourRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Title Only Tour',
        })
      );
    });

    it('should reject invalid input - title too long', async () => {
      const invalidInput = {
        ...validCreateInput,
        title: 'x'.repeat(256),
      };

      await expect(TourService.create(invalidInput)).rejects.toThrow();
    });

    it('should accept minimal valid input', async () => {
      const minimalInput = {
        title: 'Minimal Tour',
        createdBy: 'user-123',
      };

      vi.mocked(TourRepository.create).mockResolvedValue(mockTour);

      await TourService.create(minimalInput);

      expect(TourRepository.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const validUpdateInput = {
      title: 'Updated Tour Title',
      subtitle: 'Updated Subtitle',
    };

    it('should validate input and update tour', async () => {
      vi.mocked(TourRepository.update).mockResolvedValue({
        ...mockTour,
        ...validUpdateInput,
      });

      const result = await TourService.update('tour-123', validUpdateInput, 'user-123');

      expect(TourRepository.update).toHaveBeenCalledWith('tour-123', validUpdateInput, 'user-123');
      expect(result.title).toBe('Updated Tour Title');
    });

    it('should reject invalid update input', async () => {
      const invalidInput = {
        title: '',
      };

      await expect(TourService.update('tour-123', invalidInput, 'user-123')).rejects.toThrow();
    });

    it('should allow partial updates', async () => {
      const partialInput = {
        notes: 'Updated notes',
      };

      vi.mocked(TourRepository.update).mockResolvedValue({
        ...mockTour,
        notes: 'Updated notes',
      });

      await TourService.update('tour-123', partialInput, 'user-123');

      expect(TourRepository.update).toHaveBeenCalledWith('tour-123', partialInput, 'user-123');
    });

    it('should throw error when repository throws', async () => {
      vi.mocked(TourRepository.update).mockRejectedValue(new Error('Database error'));

      await expect(TourService.update('tour-123', validUpdateInput, 'user-123')).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('delete', () => {
    it('should delete tour', async () => {
      vi.mocked(TourRepository.delete).mockResolvedValue(mockTour);

      await TourService.delete('tour-123');

      expect(TourRepository.delete).toHaveBeenCalledWith('tour-123');
    });

    it('should throw error when tour not found', async () => {
      vi.mocked(TourRepository.delete).mockRejectedValue(new Error('Record not found'));

      await expect(TourService.delete('nonexistent-id')).rejects.toThrow('Record not found');
    });
  });

  describe('getArtistDisplayName', () => {
    it('should use stageName when available', () => {
      const headliner = {
        artist: {
          displayName: 'Bono',
          firstName: 'Paul',
          surname: 'Hewson',
        },
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBe('Bono');
    });

    it('should use firstName + surname when stageName null', () => {
      const headliner = {
        artist: {
          displayName: null,
          firstName: 'John',
          surname: 'Doe',
        },
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBe('John Doe');
    });

    it('should use firstName only when surname null', () => {
      const headliner = {
        artist: {
          displayName: null,
          firstName: 'Prince',
          surname: null,
        },
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBe('Prince');
    });

    it('should use surname only when firstName null', () => {
      const headliner = {
        artist: {
          displayName: null,
          firstName: null,
          surname: 'Cher',
        },
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBe('Cher');
    });

    it('should return null when all artist fields null', () => {
      const headliner = {
        artist: {
          displayName: null,
          firstName: null,
          surname: null,
        },
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBeNull();
    });

    it('should return null when artist is null', () => {
      const headliner = {
        artist: null,
      };

      const result = TourService['getArtistDisplayName'](headliner as never);

      expect(result).toBeNull();
    });
  });
});
