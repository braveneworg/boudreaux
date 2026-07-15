// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { PlaylistService } from '@/lib/services/playlist-service';

import { GET } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    getMyPlaylists: vi.fn(),
  },
}));

// Empty context for routes without dynamic params
const ctx = { params: Promise.resolve({}) };

describe('GET /api/playlists', () => {
  const mockRow = {
    id: 'playlist-1',
    title: 'Morning Mix',
    isPublic: false,
    coverImages: ['https://cdn.example.com/cover.jpg'],
    itemCount: 3,
    totalDuration: 542,
    updatedAt: '2026-07-01T10:00:00.000Z',
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    vi.mocked(PlaylistService.getMyPlaylists).mockResolvedValue({
      rows: [mockRow],
      nextSkip: null,
    });
  });

  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/playlists');
    const response = await GET(request, ctx);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
    expect(PlaylistService.getMyPlaylists).not.toHaveBeenCalled();
  });

  it('should return the caller page of playlists with default parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists');
    const response = await GET(request, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ rows: [mockRow], nextSkip: null });
    // Default take is PLAYLISTS_PAGE_SIZE (24).
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 24,
      search: undefined,
    });
  });

  it('should include Cache-Control: private, no-store header on the response', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should forward pagination parameters', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?skip=10&take=5');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 10,
      take: 5,
      search: undefined,
    });
  });

  it('should forward the search term', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?search=mix');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 24,
      search: 'mix',
    });
  });

  it('should cap take parameter to 100', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?take=500');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 100,
      search: undefined,
    });
  });

  it('should fall back to the default take when take is 0', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?take=0');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 24,
      search: undefined,
    });
  });

  it('should clamp a negative take up to 1', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?take=-3');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 1,
      search: undefined,
    });
  });

  it('should clamp negative skip to 0', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?skip=-5');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 24,
      search: undefined,
    });
  });

  it('should handle invalid numeric parameters gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/playlists?skip=invalid&take=abc');
    const response = await GET(request, ctx);

    expect(response.status).toBe(200);
    expect(PlaylistService.getMyPlaylists).toHaveBeenCalledWith('user-1', {
      skip: 0,
      take: 24,
      search: undefined,
    });
  });

  it('should return 500 when the service throws', async () => {
    vi.mocked(PlaylistService.getMyPlaylists).mockRejectedValue(Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/playlists');
    const response = await GET(request, ctx);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
