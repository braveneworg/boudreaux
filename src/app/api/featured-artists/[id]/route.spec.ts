// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { GET, PATCH, DELETE } from './route';

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
    id: 'featured-artist-123',
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/featured-artists/[id]', () => {
    it('should return a featured artist by ID', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123'
      );
      const response = await GET(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(JSON.parse(JSON.stringify(mockFeaturedArtist)));
      expect(FeaturedArtistsService.getFeaturedArtistById).toHaveBeenCalledWith(
        'featured-artist-123'
      );
    });

    it('should return 404 when featured artist not found', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Featured artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123'
      );
      const response = await GET(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve featured artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123'
      );
      const response = await GET(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve featured artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(FeaturedArtistsService.getFeaturedArtistById).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123'
      );
      const response = await GET(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/featured-artists/[id]', () => {
    it('should update a featured artist successfully', async () => {
      const updatedFeaturedArtist = { ...mockFeaturedArtist, displayName: 'Updated Artist' };
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: true,
        data: updatedFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Updated Artist' }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(JSON.parse(JSON.stringify(updatedFeaturedArtist)));
      expect(FeaturedArtistsService.updateFeaturedArtist).toHaveBeenCalledWith(
        'featured-artist-123',
        {
          displayName: 'Updated Artist',
        }
      );
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({
            displayName: 'x'.repeat(201),
          }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(FeaturedArtistsService.updateFeaturedArtist).not.toHaveBeenCalled();
    });

    it('should return 404 when featured artist not found', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists/non-existent', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Updated Artist' }),
      });
      const response = await PATCH(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Featured artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Updated Artist' }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Failed to update featured artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Updated Artist' }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update featured artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ displayName: 'Updated Artist' }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates with single field', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: true,
        data: { ...mockFeaturedArtist, description: 'Updated description' } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ description: 'Updated description' }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.updateFeaturedArtist).toHaveBeenCalledWith(
        'featured-artist-123',
        {
          description: 'Updated description',
        }
      );
    });

    it('should reconnect artists when artistIds is provided', async () => {
      const artistId1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
      const artistId2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: true,
        data: { ...mockFeaturedArtist, artistIds: [artistId1, artistId2] } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({ artistIds: [artistId1, artistId2] }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.updateFeaturedArtist).toHaveBeenCalledWith(
        'featured-artist-123',
        expect.objectContaining({
          artists: {
            set: [{ id: artistId1 }, { id: artistId2 }],
          },
        })
      );
    });

    it('should convert date strings to Date objects for publishedOn, featuredOn, and featuredUntil', async () => {
      vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'PATCH',
          body: JSON.stringify({
            publishedOn: '2026-06-01T00:00:00.000Z',
            featuredOn: '2026-07-01T00:00:00.000Z',
            featuredUntil: '2026-08-01T00:00:00.000Z',
          }),
        }
      );
      const response = await PATCH(request, createParams('featured-artist-123'));

      expect(response.status).toBe(200);
      expect(FeaturedArtistsService.updateFeaturedArtist).toHaveBeenCalledWith(
        'featured-artist-123',
        expect.objectContaining({
          publishedOn: new Date('2026-06-01T00:00:00.000Z'),
          featuredOn: new Date('2026-07-01T00:00:00.000Z'),
          featuredUntil: new Date('2026-08-01T00:00:00.000Z'),
        })
      );
    });
  });

  describe('DELETE /api/featured-artists/[id]', () => {
    it('should delete a featured artist successfully', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: true,
        data: mockFeaturedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Featured artist deleted successfully' });
      expect(FeaturedArtistsService.hardDeleteFeaturedArtist).toHaveBeenCalledWith(
        'featured-artist-123'
      );
    });

    it('should return 404 when featured artist not found', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Featured artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/featured-artists/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Featured artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockResolvedValue({
        success: false,
        error: 'Failed to delete featured artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete featured artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(FeaturedArtistsService.hardDeleteFeaturedArtist).mockRejectedValue(
        Error('Unexpected error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/featured-artists/featured-artist-123',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('featured-artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
