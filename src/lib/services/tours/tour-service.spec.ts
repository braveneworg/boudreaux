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
    findAllPublic: vi.fn(),
    findPublicById: vi.fn(),
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
        doorsOpenAt: null,
        ticketsUrl: 'https://tickets.example.com/tour-123',
        ticketIconUrl: null,
        ticketPrices: 'GA: $50, VIP: $150',
        timeZone: null,
        utcOffset: null,
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
          timeZone: null,
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
            setTime: null,
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
              bioGeneratedAt: null,
              bioModel: null,
              bioStatus: null,
              bioError: null,
              bioStartedAt: null,
              bioJobToken: null,
              bioProgress: null,
              imageLinksStatus: null,
              imageLinksError: null,
              imageLinksStartedAt: null,
              imageLinksJobToken: null,
              imageLinksAddedCount: null,
              slug: 'john-doe',
              genres: null,
              bornOn: null,
              diedOn: null,
              formedOn: null,
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
              instruments: null,
              featuredArtistId: null,
            },
          },
        ],
      },
    ],
    images: [],
  };
  describe('findAll', () => {
    it('should return paginated tours as the repository reads them', async () => {
      vi.mocked(TourRepository.findAll).mockResolvedValue([mockTour] as never);
      vi.mocked(TourRepository.count).mockResolvedValue(1);

      const result = await TourService.findAll();

      expect(result.data).toEqual([mockTour]);
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
  });

  describe('route reads', () => {
    it('reads one page of public tours', async () => {
      vi.mocked(TourRepository.findAllPublic).mockResolvedValueOnce([mockTour] as never);

      const result = await TourService.findPublicPage({ skip: 24, take: 24, search: 'x' });

      expect(TourRepository.findAllPublic).toHaveBeenCalledWith({
        skip: 24,
        take: 24,
        search: 'x',
      });
      expect(result).toEqual([mockTour]);
    });

    it('reads one tour as the public may see it', async () => {
      vi.mocked(TourRepository.findPublicById).mockResolvedValueOnce(mockTour as never);

      const result = await TourService.findPublicById('tour-123');

      expect(TourRepository.findPublicById).toHaveBeenCalledWith('tour-123');
      expect(result).toEqual(mockTour);
    });

    it('reads one tour whole, for the admin edit form', async () => {
      vi.mocked(TourRepository.findById).mockResolvedValueOnce(null);

      const result = await TourService.findAdminById('missing');

      expect(TourRepository.findById).toHaveBeenCalledWith('missing');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const validCreateInput = {
      title: 'New Tour',
      subtitle: 'Subtitle',
      description: 'Description',
      createdBy: 'user-123',
    };

    it('should create the tour from the parsed input', async () => {
      vi.mocked(TourRepository.create).mockResolvedValue(mockTour);

      const result = await TourService.create(validCreateInput);

      expect(TourRepository.create).toHaveBeenCalledWith(validCreateInput);
      expect(result).toEqual(mockTour);
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

    it('should update the tour from the parsed input', async () => {
      vi.mocked(TourRepository.update).mockResolvedValue({
        ...mockTour,
        ...validUpdateInput,
      });

      const result = await TourService.update('tour-123', validUpdateInput, 'user-123');

      expect(TourRepository.update).toHaveBeenCalledWith('tour-123', validUpdateInput, 'user-123');
      expect(result.title).toBe('Updated Tour Title');
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
});
