// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { GET, DELETE } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getFeaturedArtistById: vi.fn(),
    updateFeaturedArtist: vi.fn(),
    hardDeleteFeaturedArtist: vi.fn(),
  },
}));

describe('Featured Artist by ID API Routes', () => {
  const mockFeaturedArtist = {
    id: '507f1f77bcf86cd799439011',
    displayName: 'Test Featured Artist',
    description: 'A test featured artist description',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
    featuredOn: null,
    artistIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
    digitalFormatId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    releaseId: 'cccccccccccccccccccccccc',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });
  describe('GET /api/featured-artists/[id]', () => {
    it('should return a featured artist by ID', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockFeaturedArtist);
      expect(FeaturedArtistsService.getFeaturedArtistById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011'
      );
    });

    it('serializes BigInt fields to numbers in the response', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: true,
        data: { ...mockFeaturedArtist, viewCount: 7n } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.viewCount).toBe(7);
    });

    it('should return 404 when featured artist not found', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
        code: 'NOT_FOUND',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439012'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Featured artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve featured artist',
        code: 'UNKNOWN',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve featured artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should return 400 when featured artist ID is not a valid ObjectId', async () => {
      const request = new NextRequest('http://localhost:3000/api/featured-artists/not-valid');
      const response = await GET(request, createParams('not-valid'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid featured artist ID' });
    });
  });

  describe('DELETE /api/featured-artists/[id]', () => {
    it('should delete a featured artist successfully', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Featured artist deleted successfully' });
      expect(FeaturedArtistsService.hardDeleteFeaturedArtist).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011'
      );
    });

    it('should return 404 when featured artist not found', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
        code: 'NOT_FOUND',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439012',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Featured artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Failed to delete featured artist',
        code: 'UNKNOWN',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete featured artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
