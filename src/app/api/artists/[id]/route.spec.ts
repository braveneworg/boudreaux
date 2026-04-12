// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET, PUT, PATCH, DELETE } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistById: vi.fn(),
    updateArtist: vi.fn(),
    deleteArtist: vi.fn(),
  },
}));

describe('Artist by ID API Routes', () => {
  const mockArtist = {
    id: '507f1f77bcf86cd799439011',
    firstName: 'John',
    middleName: '',
    surname: 'Doe',
    akaNames: '',
    displayName: 'John Doe',
    title: '',
    suffix: '',
    slug: 'john-doe',
    bio: 'A test artist bio',
    shortBio: 'Short bio',
    altBio: '',
    genres: 'Jazz',
    tags: '',
    bornOn: null,
    diedOn: null,
    publishedOn: null,
    deletedOn: null,
    createdBy: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/artists/[id]', () => {
    it('should return an artist by ID', async () => {
      vi.mocked(ArtistService.getArtistById).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockArtist);
      expect(ArtistService.getArtistById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.getArtistById).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/507f1f77bcf86cd799439012');
      const response = await GET(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.getArtistById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.getArtistById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve artist',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.getArtistById).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PUT /api/artists/[id]', () => {
    it('should update an artist successfully', async () => {
      const updatedArtist = { ...mockArtist, firstName: 'Jane' };
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: updatedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Jane' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedArtist);
      expect(ArtistService.updateArtist).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
        firstName: 'Jane',
      });
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({
            firstName: 'x'.repeat(101),
          }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(ArtistService.updateArtist).not.toHaveBeenCalled();
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439012',
        {
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Jane' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 409 when slug already exists', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({ slug: 'existing-slug' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Artist with this slug already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Jane' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Failed to update artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Jane' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.updateArtist).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({ firstName: 'Jane' }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should accept multiple valid fields', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { ...mockArtist, firstName: 'Jane', bio: 'Updated bio' } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PUT',
          body: JSON.stringify({
            firstName: 'Jane',
            bio: 'Updated bio',
            slug: 'jane-doe',
          }),
        }
      );
      const response = await PUT(request, createParams('507f1f77bcf86cd799439011'));

      expect(response.status).toBe(200);
      expect(ArtistService.updateArtist).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
        firstName: 'Jane',
        bio: 'Updated bio',
        slug: 'jane-doe',
      });
    });
  });

  describe('PATCH /api/artists/[id]', () => {
    it('should partially update an artist successfully', async () => {
      const updatedArtist = { ...mockArtist, bio: 'Updated bio' };
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: updatedArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ bio: 'Updated bio' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedArtist);
      expect(ArtistService.updateArtist).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
        bio: 'Updated bio',
      });
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({
            slug: 'INVALID SLUG WITH SPACES',
          }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(ArtistService.updateArtist).not.toHaveBeenCalled();
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439012',
        {
          method: 'PATCH',
          body: JSON.stringify({ bio: 'Updated bio' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 409 when slug already exists', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ slug: 'existing-slug' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Artist with this slug already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ bio: 'Updated bio' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: false,
        error: 'Failed to update artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ bio: 'Updated bio' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.updateArtist).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ bio: 'Updated bio' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates with single field', async () => {
      vi.mocked(ArtistService.updateArtist).mockResolvedValue({
        success: true,
        data: { ...mockArtist, genres: 'Rock' } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'PATCH',
          body: JSON.stringify({ genres: 'Rock' }),
        }
      );
      const response = await PATCH(request, createParams('507f1f77bcf86cd799439011'));

      expect(response.status).toBe(200);
      expect(ArtistService.updateArtist).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
        genres: 'Rock',
      });
    });
  });

  describe('DELETE /api/artists/[id]', () => {
    it('should delete an artist successfully', async () => {
      vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Artist deleted successfully', data: mockArtist });
      expect(ArtistService.deleteArtist).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439012',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
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
      vi.mocked(ArtistService.deleteArtist).mockResolvedValue({
        success: false,
        error: 'Failed to delete artist',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
        {
          method: 'DELETE',
        }
      );
      const response = await DELETE(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.deleteArtist).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/artists/507f1f77bcf86cd799439011',
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
