// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PlaylistService } from '@/lib/services/playlist-service';
import type { PlaylistSearchResponse } from '@/lib/types/domain/playlist';

import { GET } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    searchMedia: vi.fn(),
  },
}));

// Inject a limiter with a mockable check so the REAL withRateLimit decorator
// (imported by route.ts) drives the 429 path.
const limiterCheckMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  searchLimiter: { check: limiterCheckMock },
  SEARCH_LIMIT: 15,
}));

// Empty context for routes without dynamic params
const ctx = { params: Promise.resolve({}) };

const makeRequest = (query?: string): NextRequest =>
  new NextRequest(
    query === undefined
      ? 'http://localhost:3000/api/playlists/media-search'
      : `http://localhost:3000/api/playlists/media-search?q=${encodeURIComponent(query)}`
  );

describe('GET /api/playlists/media-search', () => {
  const mockSearchResponse: PlaylistSearchResponse = {
    groups: [
      {
        key: 'songs',
        label: 'Songs',
        items: [
          {
            key: 'track:track-file-1',
            itemType: 'track',
            title: 'Opening Song',
            artistName: 'The Artist',
            coverArt: 'https://cdn.example.com/art.jpg',
            duration: 245,
            source: { trackFileId: 'track-file-1', releaseId: 'release-1' },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    limiterCheckMock.mockResolvedValue(undefined);
    vi.mocked(PlaylistService.searchMedia).mockResolvedValue(mockSearchResponse);
  });

  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(makeRequest('beat'), ctx);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
    expect(PlaylistService.searchMedia).not.toHaveBeenCalled();
  });

  it('should return 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(makeRequest('beat'), ctx);

    expect(response.status).toBe(429);
  });

  it('should not call the service when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    await GET(makeRequest('beat'), ctx);

    expect(PlaylistService.searchMedia).not.toHaveBeenCalled();
  });

  it('should return empty groups without calling the service when q is missing', async () => {
    const response = await GET(makeRequest(), ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ groups: [] });
    expect(PlaylistService.searchMedia).not.toHaveBeenCalled();
  });

  it('should return empty groups without calling the service for a 1-character query', async () => {
    const response = await GET(makeRequest('a'), ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ groups: [] });
    expect(PlaylistService.searchMedia).not.toHaveBeenCalled();
  });

  it('should treat a whitespace-padded 1-character query as too short', async () => {
    const response = await GET(makeRequest('  a '), ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ groups: [] });
    expect(PlaylistService.searchMedia).not.toHaveBeenCalled();
  });

  it('should trim the query before delegating to the service', async () => {
    const response = await GET(makeRequest('  beat  '), ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.searchMedia).toHaveBeenCalledWith('beat', 'user-1');
  });

  it('should return the grouped results from the service', async () => {
    const response = await GET(makeRequest('beat'), ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockSearchResponse);
    expect(PlaylistService.searchMedia).toHaveBeenCalledWith('beat', 'user-1');
  });

  it('should include Cache-Control: private, no-store header on the response', async () => {
    const response = await GET(makeRequest('beat'), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should return 500 when the service throws', async () => {
    vi.mocked(PlaylistService.searchMedia).mockRejectedValue(Error('DB error'));

    const response = await GET(makeRequest('beat'), ctx);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
