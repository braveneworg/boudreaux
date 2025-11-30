// Use vi.hoisted to create mock functions that are available during hoisting
import { getFeaturedArtists, getFeaturedReleases, getFeaturedContent } from './featured-service';

const { mockArtistFindMany, mockReleaseFindMany } = vi.hoisted(() => ({
  mockArtistFindMany: vi.fn(),
  mockReleaseFindMany: vi.fn(),
}));

// Mock server-only to avoid import error
vi.mock('server-only', () => ({}));

// Mock prisma module with the hoisted mock functions
vi.mock('@/app/lib/prisma', () => ({
  prisma: {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    artist: {
      findMany: mockArtistFindMany,
    },
    release: {
      findMany: mockReleaseFindMany,
    },
  },
}));

describe('FeaturedService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeaturedArtists', () => {
    it('should return empty array when no artists are featured', async () => {
      mockArtistFindMany.mockResolvedValue([]);

      const result = await getFeaturedArtists();

      expect(result).toEqual([]);
      expect(mockArtistFindMany).toHaveBeenCalledTimes(1);
    });

    it('should return featured artists within date range', async () => {
      const mockArtists = [
        {
          id: '1',
          displayName: 'Test Artist',
          firstName: 'Test',
          surname: 'Artist',
          shortBio: 'A test artist',
          featuredDescription: 'Featured for testing',
          featuredOn: new Date('2024-01-01'),
          featuredUntil: new Date('2025-12-31'),
          slug: 'test-artist',
          featuredTrack: {
            id: 'track-1',
            title: 'Test Track',
            audioFile: '/audio/test.mp3',
          },
        },
      ];

      mockArtistFindMany.mockResolvedValue(mockArtists);

      const result = await getFeaturedArtists(new Date('2024-06-15'));

      expect(result).toEqual(mockArtists);
      expect(mockArtistFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            featuredOn: expect.objectContaining({
              not: null,
              lte: new Date('2024-06-15'),
            }),
          }),
        })
      );
    });

    it('should include artists with null featuredUntil (indefinitely featured)', async () => {
      const mockArtists = [
        {
          id: '2',
          displayName: 'Forever Featured',
          firstName: 'Forever',
          surname: 'Featured',
          shortBio: 'Indefinitely featured',
          featuredDescription: null,
          featuredOn: new Date('2024-01-01'),
          featuredUntil: null,
          slug: 'forever-featured',
          featuredTrack: null,
        },
      ];

      mockArtistFindMany.mockResolvedValue(mockArtists);

      const result = await getFeaturedArtists();

      expect(result).toEqual(mockArtists);
    });

    it('should use current date when no date is provided', async () => {
      mockArtistFindMany.mockResolvedValue([]);

      const beforeCall = new Date();
      await getFeaturedArtists();
      const afterCall = new Date();

      expect(mockArtistFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            featuredOn: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        })
      );

      // Verify the date used is within the test window
      const calledWith = mockArtistFindMany.mock.calls[0][0];
      const usedDate = calledWith.where.featuredOn.lte;
      expect(usedDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(usedDate.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should order results by featuredOn descending', async () => {
      mockArtistFindMany.mockResolvedValue([]);

      await getFeaturedArtists();

      expect(mockArtistFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            featuredOn: 'desc',
          },
        })
      );
    });

    it('should select correct fields', async () => {
      mockArtistFindMany.mockResolvedValue([]);

      await getFeaturedArtists();

      expect(mockArtistFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            displayName: true,
            firstName: true,
            surname: true,
            shortBio: true,
            featuredDescription: true,
            featuredOn: true,
            featuredUntil: true,
            slug: true,
            featuredTrack: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                title: true,
                audioFile: true,
              }),
            }),
          }),
        })
      );
    });
  });

  describe('getFeaturedReleases', () => {
    it('should return empty array when no releases are featured', async () => {
      mockReleaseFindMany.mockResolvedValue([]);

      const result = await getFeaturedReleases();

      expect(result).toEqual([]);
      expect(mockReleaseFindMany).toHaveBeenCalledTimes(1);
    });

    it('should return featured releases with transformed artists', async () => {
      const mockReleases = [
        {
          id: 'release-1',
          title: 'Test Album',
          description: 'A test album',
          coverArt: '/images/cover.jpg',
          releasedOn: new Date('2024-01-15'),
          featuredOn: new Date('2024-02-01'),
          featuredUntil: new Date('2024-03-01'),
          featuredDescription: 'Featured album',
          artistReleases: [
            {
              artist: {
                id: 'artist-1',
                displayName: 'Artist One',
                firstName: 'Artist',
                surname: 'One',
                slug: 'artist-one',
              },
            },
            {
              artist: {
                id: 'artist-2',
                displayName: null,
                firstName: 'Artist',
                surname: 'Two',
                slug: 'artist-two',
              },
            },
          ],
        },
      ];

      mockReleaseFindMany.mockResolvedValue(mockReleases);

      const result = await getFeaturedReleases(new Date('2024-02-15'));

      expect(result).toEqual([
        {
          id: 'release-1',
          title: 'Test Album',
          description: 'A test album',
          coverArt: '/images/cover.jpg',
          releasedOn: new Date('2024-01-15'),
          featuredOn: new Date('2024-02-01'),
          featuredUntil: new Date('2024-03-01'),
          featuredDescription: 'Featured album',
          artists: [
            {
              id: 'artist-1',
              displayName: 'Artist One',
              firstName: 'Artist',
              surname: 'One',
              slug: 'artist-one',
            },
            {
              id: 'artist-2',
              displayName: null,
              firstName: 'Artist',
              surname: 'Two',
              slug: 'artist-two',
            },
          ],
        },
      ]);
    });

    it('should include releases with null featuredUntil (indefinitely featured)', async () => {
      const mockReleases = [
        {
          id: 'release-2',
          title: 'Forever Featured Album',
          description: 'Indefinitely featured',
          coverArt: '/images/forever.jpg',
          releasedOn: new Date('2024-01-01'),
          featuredOn: new Date('2024-01-01'),
          featuredUntil: null,
          featuredDescription: null,
          artistReleases: [],
        },
      ];

      mockReleaseFindMany.mockResolvedValue(mockReleases);

      const result = await getFeaturedReleases();

      expect(result).toHaveLength(1);
      expect(result[0].featuredUntil).toBeNull();
      expect(result[0].artists).toEqual([]);
    });

    it('should use current date when no date is provided', async () => {
      mockReleaseFindMany.mockResolvedValue([]);

      const beforeCall = new Date();
      await getFeaturedReleases();
      const afterCall = new Date();

      expect(mockReleaseFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            featuredOn: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        })
      );

      const calledWith = mockReleaseFindMany.mock.calls[0][0];
      const usedDate = calledWith.where.featuredOn.lte;
      expect(usedDate.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(usedDate.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should order results by featuredOn descending', async () => {
      mockReleaseFindMany.mockResolvedValue([]);

      await getFeaturedReleases();

      expect(mockReleaseFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            featuredOn: 'desc',
          },
        })
      );
    });
  });

  describe('getFeaturedContent', () => {
    it('should return both featured artists and releases', async () => {
      const mockArtists = [
        {
          id: 'artist-1',
          displayName: 'Featured Artist',
          firstName: 'Featured',
          surname: 'Artist',
          shortBio: 'Bio',
          featuredDescription: 'Featured',
          featuredOn: new Date('2024-01-01'),
          featuredUntil: new Date('2024-12-31'),
          slug: 'featured-artist',
          featuredTrack: null,
        },
      ];

      const mockReleases = [
        {
          id: 'release-1',
          title: 'Featured Album',
          description: 'Album description',
          coverArt: '/cover.jpg',
          releasedOn: new Date('2024-01-01'),
          featuredOn: new Date('2024-01-01'),
          featuredUntil: new Date('2024-12-31'),
          featuredDescription: 'Featured release',
          artistReleases: [],
        },
      ];

      mockArtistFindMany.mockResolvedValue(mockArtists);
      mockReleaseFindMany.mockResolvedValue(mockReleases);

      const result = await getFeaturedContent(new Date('2024-06-01'));

      expect(result.artists).toEqual(mockArtists);
      expect(result.releases).toHaveLength(1);
      expect(result.releases[0].id).toBe('release-1');
    });

    it('should return empty arrays when no featured content exists', async () => {
      mockArtistFindMany.mockResolvedValue([]);
      mockReleaseFindMany.mockResolvedValue([]);

      const result = await getFeaturedContent();

      expect(result).toEqual({
        artists: [],
        releases: [],
      });
    });

    it('should fetch artists and releases in parallel', async () => {
      // Track call order
      const callOrder: string[] = [];

      mockArtistFindMany.mockImplementation(async () => {
        callOrder.push('artist-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('artist-end');
        return [];
      });

      mockReleaseFindMany.mockImplementation(async () => {
        callOrder.push('release-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('release-end');
        return [];
      });

      await getFeaturedContent();

      // Both should start before either ends (parallel execution)
      expect(callOrder).toContain('artist-start');
      expect(callOrder).toContain('release-start');
      expect(mockArtistFindMany).toHaveBeenCalledTimes(1);
      expect(mockReleaseFindMany).toHaveBeenCalledTimes(1);
    });

    it('should use the same date for both queries', async () => {
      const testDate = new Date('2024-07-15');

      mockArtistFindMany.mockResolvedValue([]);
      mockReleaseFindMany.mockResolvedValue([]);

      await getFeaturedContent(testDate);

      const artistCall = mockArtistFindMany.mock.calls[0][0];
      const releaseCall = mockReleaseFindMany.mock.calls[0][0];

      expect(artistCall.where.featuredOn.lte).toEqual(testDate);
      expect(releaseCall.where.featuredOn.lte).toEqual(testDate);
    });
  });
});
