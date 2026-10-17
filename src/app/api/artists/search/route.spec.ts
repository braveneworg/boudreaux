/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET } from './route';

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    searchForHomeNav: vi.fn(),
  },
}));

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: (s3Key: string) => `https://cdn.example.com/${s3Key}?signed`,
}));

// Mock rate limiting to pass through
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) =>
    (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  searchLimiter: {},
  SEARCH_LIMIT: 30,
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

const dummyContext = { params: Promise.resolve({}) };

const CACHE_HEADER = 'public, s-maxage=60, stale-while-revalidate=300';

/** A playable release row as the home search read returns it. */
const releaseRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'release-1',
  title: 'Album One',
  coverArt: 'https://example.com/album-one.jpg',
  releasedOn: new Date('2024-03-01T00:00:00.000Z'),
  images: [],
  digitalFormats: [{ files: [{ s3Key: 'releases/release-1/01-track.mp3' }] }],
  ...overrides,
});

/** A live video credit as the home search read returns it. */
const videoCredit = (overrides: Record<string, unknown> = {}) => ({
  video: {
    id: 'video-1',
    title: 'Video One',
    posterUrl: 'https://example.com/poster.jpg',
    releasedOn: new Date('2025-06-01T00:00:00.000Z'),
    durationSeconds: 125,
    s3Key: 'media/videos/video-1/video.mp4',
    ...overrides,
  },
});

describe('GET /api/artists/search', () => {
  beforeEach(() => {
    // Pinned: worktrees carry real env files, and the MP3 stream URL is built
    // from the CDN domain.
    vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example.com');
    vi.stubEnv('CDN_DOMAIN', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
  });

  it('should return empty results when query is shorter than 3 characters', async () => {
    const request = createRequest('ab');
    const response = await GET(request, dummyContext);
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(ArtistService.searchForHomeNav).not.toHaveBeenCalled();
  });

  it('should return empty results when query is empty', async () => {
    const request = new NextRequest(new URL('http://localhost/api/artists/search'));
    const response = await GET(request, dummyContext);
    const body = await response.json();

    expect(body).toEqual({ results: [] });
  });

  it('should call ArtistService.searchForHomeNav with the query', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: true,
      data: [],
    });

    const request = createRequest('test');
    await GET(request, dummyContext);

    expect(ArtistService.searchForHomeNav).toHaveBeenCalledWith({
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
        bioImages: [
          {
            url: 'https://example.com/full.jpg',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            isPrimary: true,
            alt: 'John Doe on stage',
            displayOrder: null,
          },
        ],
        releases: [{ release: releaseRecord() }],
        videoArtists: [videoCredit()],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request, dummyContext);
    const body = await response.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toEqual({
      artistSlug: 'john-doe',
      artistName: 'John Doe',
      thumbnailSrc: 'https://example.com/thumb.jpg',
      releases: [
        {
          id: 'release-1',
          title: 'Album One',
          coverArtSrc: 'https://example.com/album-one.jpg',
          playSrc: 'https://cdn.example.com/releases/release-1/01-track.mp3',
          year: 2024,
        },
      ],
      videos: [
        {
          id: 'video-1',
          title: 'Video One',
          posterSrc: 'https://example.com/poster.jpg',
          streamUrl: 'https://cdn.example.com/media/videos/video-1/video.mp4?signed',
          year: 2025,
          durationSeconds: 125,
        },
      ],
    });
  });

  // A pick plays at once: the release row carries its first track's stream URL.
  it('should give each release row the stream URL of its first track and its year', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          bioImages: [],
          releases: [{ release: releaseRecord() }],
          videoArtists: [],
        },
      ] as never,
    });

    const body = await (await GET(createRequest('john'), dummyContext)).json();

    expect(body.results[0].releases[0]).toMatchObject({
      playSrc: 'https://cdn.example.com/releases/release-1/01-track.mp3',
      year: 2024,
    });
  });

  // The year is the UTC year: a release on New Year's Day reads as that year
  // in every time zone.
  it('should read the release year in UTC', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          bioImages: [],
          releases: [
            { release: releaseRecord({ releasedOn: new Date('2024-01-01T00:00:00.000Z') }) },
          ],
          videoArtists: [videoCredit({ releasedOn: new Date('2025-12-31T23:59:59.000Z') })],
        },
      ] as never,
    });

    const body = await (await GET(createRequest('john'), dummyContext)).json();

    expect(body.results[0].releases[0].year).toBe(2024);
    expect(body.results[0].videos[0].year).toBe(2025);
  });

  it('should give each video row a signed stream URL, its poster, year and duration', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          bioImages: [],
          releases: [],
          videoArtists: [videoCredit({ posterUrl: null, durationSeconds: null })],
        },
      ] as never,
    });

    const body = await (await GET(createRequest('john'), dummyContext)).json();

    expect(body.results[0].videos).toEqual([
      {
        id: 'video-1',
        title: 'Video One',
        posterSrc: null,
        streamUrl: 'https://cdn.example.com/media/videos/video-1/video.mp4?signed',
        year: 2025,
        durationSeconds: null,
      },
    ]);
  });

  it('should never send the S3 key of a video', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          bioImages: [],
          releases: [],
          videoArtists: [videoCredit()],
        },
      ] as never,
    });

    const body = await (await GET(createRequest('john'), dummyContext)).json();

    expect(body.results[0].videos[0]).not.toHaveProperty('s3Key');
  });

  it('should skip a video that has no release date', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: 'John Doe',
          slug: 'john-doe',
          bioImages: [],
          releases: [],
          videoArtists: [
            videoCredit({ id: 'undated', releasedOn: null }),
            videoCredit({ id: 'dated' }),
          ],
        },
      ] as never,
    });

    const body = await (await GET(createRequest('john'), dummyContext)).json();

    expect(body.results[0].videos.map(({ id }: { id: string }) => id)).toEqual(['dated']);
  });

  it('should share-cache the results', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({ success: true, data: [] });

    const response = await GET(createRequest('john'), dummyContext);

    expect(response.headers.get('Cache-Control')).toBe(CACHE_HEADER);
  });

  it('should share-cache the empty answer to a short query', async () => {
    const response = await GET(createRequest('ab'), dummyContext);

    expect(response.headers.get('Cache-Control')).toBe(CACHE_HEADER);
  });

  it('should fall back to the first release image when the cover art is empty', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [],
        releases: [
          {
            release: releaseRecord({
              coverArt: '',
              images: [{ src: 'https://example.com/album-one-image.jpg', altText: null }],
            }),
          },
        ],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: mockArtists as never,
    });

    const response = await GET(createRequest('john'), dummyContext);
    const body = await response.json();

    expect(body.results[0].releases[0].coverArtSrc).toBe('https://example.com/album-one-image.jpg');
  });

  it('should use null for the cover art when a release has neither cover art nor images', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [],
        releases: [{ release: releaseRecord({ coverArt: '' }) }],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: mockArtists as never,
    });

    const response = await GET(createRequest('john'), dummyContext);
    const body = await response.json();

    expect(body.results[0].releases[0].coverArtSrc).toBeNull();
  });

  it('should use null for thumbnail when artist has no display images', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [],
        releases: [],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('john');
    const response = await GET(request, dummyContext);
    const body = await response.json();

    expect(body.results[0].thumbnailSrc).toBeNull();
  });

  // An unchosen image without alt text is never a display image (ADR-0008,
  // addendum for #767), so the projection must carry `alt` for the fallback
  // tiers to find one.
  it('should skip a suggested image that has no alt text', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [
          {
            url: 'https://example.com/no-alt.jpg',
            thumbnailUrl: 'https://example.com/no-alt_thumb.jpg',
            isPrimary: true,
            displayOrder: null,
            alt: null,
          },
          {
            url: 'https://example.com/with-alt.jpg',
            thumbnailUrl: 'https://example.com/with-alt_thumb.jpg',
            isPrimary: false,
            displayOrder: null,
            alt: 'John Doe at the mic',
          },
        ],
        releases: [],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: mockArtists as never,
    });

    const response = await GET(createRequest('john'), dummyContext);
    const body = await response.json();

    expect(body.results[0].thumbnailSrc).toBe('https://example.com/with-alt_thumb.jpg');
  });

  it("should use the human-chosen display image over the job's suggestion", async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [
          {
            url: 'https://example.com/suggested.jpg',
            thumbnailUrl: 'https://example.com/suggested_thumb.jpg',
            isPrimary: true,
            displayOrder: null,
          },
          {
            url: 'https://example.com/second.jpg',
            thumbnailUrl: 'https://example.com/second_thumb.jpg',
            isPrimary: false,
            displayOrder: 1,
          },
          {
            url: 'https://example.com/chosen.jpg',
            thumbnailUrl: 'https://example.com/chosen_thumb.jpg',
            isPrimary: false,
            displayOrder: 0,
          },
        ],
        releases: [],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: mockArtists as never,
    });

    const response = await GET(createRequest('john'), dummyContext);
    const body = await response.json();

    expect(body.results[0].thumbnailSrc).toBe('https://example.com/chosen_thumb.jpg');
  });

  it('should fall back to the full image url when the display image has no thumbnail', async () => {
    const mockArtists = [
      {
        id: 'artist-2',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        bioImages: [
          {
            url: 'https://example.com/jane.jpg',
            thumbnailUrl: null,
            isPrimary: true,
            alt: 'Jane Smith portrait',
            displayOrder: null,
          },
        ],
        releases: [],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValueOnce({
      success: true,
      data: mockArtists as never,
    });

    const response = await GET(createRequest('jane'), dummyContext);
    const body = await response.json();

    expect(body.results[0].thumbnailSrc).toBe('https://example.com/jane.jpg');
  });

  it('should return 500 when service returns an error', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: false,
      error: 'Failed to search artists',
      code: 'UNKNOWN',
    });

    const request = createRequest('test');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Failed to search artists' });
  });

  it('should return 503 when database is unavailable', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
      code: 'UNAVAILABLE',
    });

    const request = createRequest('test');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: 'Database unavailable' });
  });

  it('should return 500 when an unexpected error is thrown', async () => {
    vi.mocked(ArtistService.searchForHomeNav).mockRejectedValue(new Error('Unexpected error'));

    const request = createRequest('test');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });

  it('should return multiple artists in results', async () => {
    const mockArtists = [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        bioImages: [],
        releases: [],
        videoArtists: [],
      },
      {
        id: 'artist-2',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        bioImages: [
          {
            url: 'https://example.com/jane.jpg',
            thumbnailUrl: null,
            isPrimary: true,
            alt: 'Jane Smith portrait',
            displayOrder: null,
          },
        ],
        releases: [],
        videoArtists: [],
      },
    ];

    vi.mocked(ArtistService.searchForHomeNav).mockResolvedValue({
      success: true,
      data: mockArtists as never,
    });

    const request = createRequest('art');
    const response = await GET(request, dummyContext);
    const body = await response.json();

    expect(body.results).toHaveLength(2);
    expect(body.results[0].artistSlug).toBe('john-doe');
    expect(body.results[1].artistSlug).toBe('jane-smith');
  });
});
