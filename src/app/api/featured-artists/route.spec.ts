// @vitest-environment node
import { NextRequest } from 'next/server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: (request: Request) => Promise<Response>) =>
    Promise.resolve((request: Request) => handler(request)),
}));

vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getAllFeaturedArtists: vi.fn(),
    createFeaturedArtist: vi.fn(),
    getFeaturedArtistById: vi.fn(),
    updateFeaturedArtist: vi.fn(),
    hardDeleteFeaturedArtist: vi.fn(),
  },
}));

// Create POST reference after mocking
const POST = postHandler;

describe('Featured Artists API Routes', () => {
  const mockFeaturedArtist = {
    id: 'featured-123',
    displayName: 'Featured Artist Name',
    featuredOn: new Date('2024-01-15'),
    position: 1,
    description: 'A featured artist description',
    coverArt: 'https://example.com/cover.jpg',
    trackId: null,
    releaseId: null,
    groupId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [],
    track: null,
    release: null,
    group: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/featured-artists', () => {
    it('should return all featured artists with default parameters', async () => {
      const mockFeaturedArtists = [mockFeaturedArtist];
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: mockFeaturedArtists as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        featuredArtists: mockFeaturedArtists,
        count: 1,
      });
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({});
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists?skip=10&take=5');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
      });
    });

    it('should handle search parameter', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists?search=featured');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({
        search: 'featured',
      });
    });

    it('should return empty array when no featured artists found', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        featuredArtists: [],
        count: 0,
      });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other errors', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve featured artists',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve featured artists' });
    });
  });

  describe('POST /api/featured-artists', () => {
    it('should create a new featured artist', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Featured Artist Name',
          featuredOn: '2024-01-15',
          position: 1,
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockFeaturedArtist);
    });

    it('should return 503 when database is unavailable on create', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Featured Artist Name',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for create errors', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Failed to create artist',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Featured Artist Name',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create artist' });
    });
  });
});
