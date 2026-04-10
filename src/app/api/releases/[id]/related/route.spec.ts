// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getArtistOtherReleases: vi.fn(),
  },
}));

describe('GET /api/releases/[id]/related', () => {
  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty releases when no artistId provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/releases/release-1/related');
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ releases: [] });
    expect(ReleaseService.getArtistOtherReleases).not.toHaveBeenCalled();
  });

  it('should return related releases for the given artist', async () => {
    const mockReleases = [
      { id: 'release-2', title: 'Other Album' },
      { id: 'release-3', title: 'Third Album' },
    ];

    vi.mocked(ReleaseService.getArtistOtherReleases).mockResolvedValue({
      success: true,
      data: mockReleases as never,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/releases/release-1/related?artistId=artist-1'
    );
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ releases: mockReleases });
    expect(ReleaseService.getArtistOtherReleases).toHaveBeenCalledWith('artist-1', 'release-1');
  });

  it('should return 503 when database is unavailable', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/releases/release-1/related?artistId=artist-1'
    );
    const response = await GET(request, createParams('release-1'));

    expect(response.status).toBe(503);
  });

  it('should return 500 for other errors', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockResolvedValue({
      success: false,
      error: 'Failed to fetch',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/releases/release-1/related?artistId=artist-1'
    );
    const response = await GET(request, createParams('release-1'));

    expect(response.status).toBe(500);
  });

  it('should return 500 when an exception is thrown', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockRejectedValue(new Error('Unexpected'));

    const request = new NextRequest(
      'http://localhost:3000/api/releases/release-1/related?artistId=artist-1'
    );
    const response = await GET(request, createParams('release-1'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
