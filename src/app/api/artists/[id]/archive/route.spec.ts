// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { POST } from './route';

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    archiveArtist: vi.fn(),
  },
}));

describe('Artist Archive API Route', () => {
  const mockArtist = {
    id: 'artist-123',
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

  describe('POST /api/artists/[id]/archive', () => {
    it('should archive an artist successfully', async () => {
      vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
        success: true,
        data: { ...mockArtist, deletedOn: new Date().toISOString() } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/artist-123/archive', {
        method: 'POST',
      });
      const response = await POST(request, createParams('artist-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('message', 'Artist archived successfully');
      expect(data).toHaveProperty('data');
      expect(ArtistService.archiveArtist).toHaveBeenCalledWith('artist-123');
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/non-existent/archive', {
        method: 'POST',
      });
      const response = await POST(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/artist-123/archive', {
        method: 'POST',
      });
      const response = await POST(request, createParams('artist-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.archiveArtist).mockResolvedValue({
        success: false,
        error: 'Failed to archive artist',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/artist-123/archive', {
        method: 'POST',
      });
      const response = await POST(request, createParams('artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to archive artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.archiveArtist).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists/artist-123/archive', {
        method: 'POST',
      });
      const response = await POST(request, createParams('artist-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
