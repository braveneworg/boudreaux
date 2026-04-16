// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET } from './route';

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistBySlug: vi.fn(),
    getArtistBySlugWithReleases: vi.fn(),
  },
}));

describe('Artist by Slug API Route', () => {
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

  const createParams = (slug: string) => ({
    params: Promise.resolve({ slug }),
  });
  describe('GET /api/artists/slug/[slug]', () => {
    it('should return an artist by slug', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        ...mockArtist,
        createdAt: mockArtist.createdAt.toISOString(),
        updatedAt: mockArtist.updatedAt.toISOString(),
      });
      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-doe');
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve artist',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle slugs with multiple segments', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-michael-doe');
      const response = await GET(request, createParams('john-michael-doe'));

      expect(response.status).toBe(200);
      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-michael-doe');
    });
  });

  describe('GET /api/artists/slug/[slug]?withReleases=true', () => {
    const mockArtistWithReleases = {
      ...mockArtist,
      releases: [{ release: { id: 'release-1', title: 'Album One' } }],
    };

    it('should call getArtistBySlugWithReleases when withReleases=true', async () => {
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValue({
        success: true,
        data: mockArtistWithReleases as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/john-doe?withReleases=true'
      );
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.releases).toHaveLength(1);
      expect(ArtistService.getArtistBySlugWithReleases).toHaveBeenCalledWith('john-doe');
      expect(ArtistService.getArtistBySlug).not.toHaveBeenCalled();
    });

    it('should call getArtistBySlug when withReleases is not set', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      await GET(request, createParams('john-doe'));

      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-doe');
      expect(ArtistService.getArtistBySlugWithReleases).not.toHaveBeenCalled();
    });

    it('should return 404 when artist not found with releases', async () => {
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/no-one?withReleases=true'
      );
      const response = await GET(request, createParams('no-one'));

      expect(response.status).toBe(404);
    });
  });
});
