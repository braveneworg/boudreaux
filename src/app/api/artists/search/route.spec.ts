/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET } from './route';

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    searchPublishedArtists: vi.fn(),
  },
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: {
    displayName?: string | null;
    firstName: string;
    surname: string;
  }) => artist.displayName ?? `${artist.firstName} ${artist.surname}`,
}));

const createRequest = (query: string): NextRequest =>
  new NextRequest(new URL(`http://localhost/api/artists/search?q=${encodeURIComponent(query)}`));

describe('GET /api/artists/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty results when query is shorter than 3 characters', async () => {
    const request = createRequest('ab');
    const response = await GET(request);
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(ArtistService.searchPublishedArtists).not.toHaveBeenCalled();
  });

  it('should return empty results when query is empty', async () => {
    const request = new NextRequest(new URL('http://localhost/api/artists/search'));
    const response = await GET(request);
    const body = await response.json();

    expect(body).toEqual({ results: [] });
  });

  it('should call ArtistService.searchPublishedArtists with the query', async () => {
    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: [],
    });

    const request = createRequest('test');
    await GET(request);

    expect(ArtistService.searchPublishedArtists).toHaveBeenCalledWith({
      search: 'test',
      take: 20,
    });
  });

  it('should return mapped artist results', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [{ src: 'https://example.com/thumb.jpg' }],
        releases: [
          {
            release: {
              id: 'release-1',
              title: 'Album One',
              publishedAt: new Date('2024-01-01'),
              deletedOn: null,
            },
          },
        ],
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      artistSlug: 'john-doe',
      artistName: 'John Doe',
      thumbnailSrc: 'https://example.com/thumb.jpg',
      releases: [{ id: 'release-1', title: 'Album One' }],
    });
  });

  it('should filter out unpublished releases', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [],
        releases: [
          {
            release: {
              id: 'release-1',
              title: 'Published Album',
              publishedAt: new Date('2024-01-01'),
              deletedOn: null,
            },
          },
          {
            release: {
              id: 'release-2',
              title: 'Unpublished Album',
              publishedAt: null,
              deletedOn: null,
            },
          },
        ],
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results[0].releases).toHaveLength(1);
    expect(body.results[0].releases[0].title).toBe('Published Album');
  });

  it('should filter out deleted releases', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [],
        releases: [
          {
            release: {
              id: 'release-1',
              title: 'Active Album',
              publishedAt: new Date('2024-01-01'),
              deletedOn: null,
            },
          },
          {
            release: {
              id: 'release-2',
              title: 'Deleted Album',
              publishedAt: new Date('2024-01-01'),
              deletedOn: new Date('2024-06-01'),
            },
          },
        ],
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results[0].releases).toHaveLength(1);
    expect(body.results[0].releases[0].title).toBe('Active Album');
  });

  it('should use null for thumbnail when artist has no images', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [],
        releases: [],
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results[0].thumbnailSrc).toBeNull();
  });

  it('should return 500 when service returns an error', async () => {
    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: false,
      error: 'Failed to search artists',
    });

    const request = createRequest('test');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Failed to search artists' });
  });

  it('should return 503 when database is unavailable', async () => {
    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const request = createRequest('test');
    const response = await GET(request);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: 'Database unavailable' });
  });

  it('should return 500 when an unexpected error is thrown', async () => {
    vi.mocked(ArtistService.searchPublishedArtists).mockRejectedValue(
      new Error('Unexpected error')
    );

    const request = createRequest('test');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });

  it('should handle artist with no releases array', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [],
        releases: undefined,
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results[0].releases).toEqual([]);
  });

  it('should return multiple artists in results', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        images: [],
        releases: [],
      },
      {
        id: 'artist-2',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        images: [{ src: 'https://example.com/jane.jpg' }],
        releases: [],
      },
    ];

    vi.mocked(ArtistService.searchPublishedArtists).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('art');
    const response = await GET(request);
    const body = await response.json();

    expect(body.results).toHaveLength(2);
    expect(body.results[0].artistSlug).toBe('john-doe');
    expect(body.results[1].artistSlug).toBe('jane-smith');
  });
});
