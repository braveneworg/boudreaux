// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock rate limiting to pass through
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) => (handler: Function) => (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: {},
  PUBLIC_LIMIT: 100,
}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: (request: Request) => Promise<Response>) =>
    Promise.resolve((request: Request) => handler(request)),
}));

// Mock auth for inline admin checks in the non-active listing path
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getAllFeaturedArtists: vi.fn(),
    getFeaturedArtists: vi.fn(),
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
    digitalFormatId: null,
    releaseId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [],
    digitalFormat: null,
    release: null,
  };

  const dummyContext = { params: Promise.resolve({}) };
  describe('GET /api/featured-artists', () => {
    it('should return 401 when not authenticated for admin listing', async () => {
      vi.mocked(auth).mockResolvedValueOnce(null as never);

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Authentication required' });
      expect(FeaturedArtistsService.getAllFeaturedArtists).not.toHaveBeenCalled();
    });

    it('should return 401 when user role is not admin for admin listing', async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: 'user-1', role: 'user', email: 'user@example.com', name: 'User' },
      } as never);

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Authentication required' });
      expect(FeaturedArtistsService.getAllFeaturedArtists).not.toHaveBeenCalled();
    });

    it('should return all featured artists with default parameters', async () => {
      const mockFeaturedArtists = [mockFeaturedArtist];
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: mockFeaturedArtists as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        featuredArtists: JSON.parse(JSON.stringify(mockFeaturedArtists)),
        count: 1,
      });
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({});
    });

    it('should include Cache-Control: private, no-store header on admin GET response', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists?skip=10&take=5');
      const response = await GET(request, dummyContext);

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
      const response = await GET(request, dummyContext);

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({
        search: 'featured',
      });
    });

    it('should cap take parameter to 100', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists?take=500');
      const response = await GET(request, dummyContext);

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({
        take: 100,
      });
    });

    it('should clamp negative skip to 0', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [mockFeaturedArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists?skip=-5');
      const response = await GET(request, dummyContext);

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.getAllFeaturedArtists).toHaveBeenCalledWith({
        skip: 0,
      });
    });

    it('should serialize BigInt values to numbers in the response', async () => {
      const artistWithBigInt = {
        ...mockFeaturedArtist,
        position: BigInt(1),
      };
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [artistWithBigInt] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.featuredArtists[0].position).toBe(1);
      expect(typeof data.featuredArtists[0].position).toBe('number');
    });

    it('should return empty array when no featured artists found', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
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
      const response = await GET(request, dummyContext);
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
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve featured artists' });
    });

    describe('active mode (?active=true)', () => {
      it('should call getFeaturedArtists with default limit when active=true', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: true,
          data: [mockFeaturedArtist] as never,
        });

        const request = new NextRequest('http://localhost:3000/api/featured-artists?active=true');
        const response = await GET(request, dummyContext);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.featuredArtists).toHaveLength(1);
        expect(data.count).toBe(1);
        expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(
          expect.any(Date),
          10
        );
        expect(FeaturedArtistsService.getAllFeaturedArtists).not.toHaveBeenCalled();
      });

      it('should respect custom limit parameter', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: true,
          data: [] as never,
        });

        const request = new NextRequest(
          'http://localhost:3000/api/featured-artists?active=true&limit=7'
        );
        await GET(request, dummyContext);

        expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 7);
      });

      it('should cap limit to 100', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: true,
          data: [] as never,
        });

        const request = new NextRequest(
          'http://localhost:3000/api/featured-artists?active=true&limit=500'
        );
        await GET(request, dummyContext);

        expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(
          expect.any(Date),
          100
        );
      });

      it('should clamp limit to minimum of 1', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: true,
          data: [] as never,
        });

        const request = new NextRequest(
          'http://localhost:3000/api/featured-artists?active=true&limit=-5'
        );
        await GET(request, dummyContext);

        expect(FeaturedArtistsService.getFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 1);
      });

      it('should include Cache-Control header on active GET response', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: true,
          data: [mockFeaturedArtist] as never,
        });

        const request = new NextRequest('http://localhost:3000/api/featured-artists?active=true');
        const response = await GET(request, dummyContext);

        expect(response.headers.get('Cache-Control')).toBe(
          'public, s-maxage=60, stale-while-revalidate=300'
        );
      });

      it('should return 503 when database is unavailable in active mode', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: false,
          error: 'Database unavailable',
        });

        const request = new NextRequest('http://localhost:3000/api/featured-artists?active=true');
        const response = await GET(request, dummyContext);

        expect(response.status).toBe(503);
      });

      it('should return 500 for other errors in active mode', async () => {
        vi.mocked(FeaturedArtistsService.getFeaturedArtists).mockResolvedValue({
          success: false,
          error: 'Failed to fetch artists',
        });

        const request = new NextRequest('http://localhost:3000/api/featured-artists?active=true');
        const response = await GET(request, dummyContext);
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({ error: 'Failed to fetch artists' });
      });
    });
  });

  describe('POST /api/featured-artists', () => {
    const validPostBody = {
      displayName: 'Featured Artist Name',
      position: 1,
      artistIds: ['507f1f77bcf86cd799439011'],
      digitalFormatId: '507f1f77bcf86cd799439012',
      releaseId: '507f1f77bcf86cd799439013',
    };

    it('should create a new featured artist', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify(validPostBody),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(JSON.parse(JSON.stringify(mockFeaturedArtist)));
    });

    it('should return 400 when required fields are missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Featured Artist Name',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
    });

    it('should return 503 when database is unavailable on create', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify(validPostBody),
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
        body: JSON.stringify(validPostBody),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create artist' });
    });

    it('should handle unexpected errors in GET and return 500', async () => {
      vi.mocked(FeaturedArtistsService.getAllFeaturedArtists).mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = new NextRequest('http://localhost:3000/api/featured-artists');
      const response = await GET(request, dummyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle unexpected errors in POST and return 500', async () => {
      vi.mocked(FeaturedArtistsService.createFeaturedArtist).mockRejectedValue(
        new Error('Unexpected error')
      );

      const request = new NextRequest('http://localhost:3000/api/featured-artists', {
        method: 'POST',
        body: JSON.stringify(validPostBody),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
