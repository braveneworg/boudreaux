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
  it('should return empty releases when no artistId provided', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/related'
    );
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
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
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/related?artistId=607f1f77bcf86cd799439013'
    );
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ releases: mockReleases });
    expect(ReleaseService.getArtistOtherReleases).toHaveBeenCalledWith(
      '607f1f77bcf86cd799439013',
      '507f1f77bcf86cd799439011'
    );
  });

  it('should return 503 when database is unavailable', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/related?artistId=607f1f77bcf86cd799439013'
    );
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));

    expect(response.status).toBe(503);
  });

  it('should return 500 for other errors', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockResolvedValue({
      success: false,
      error: 'Failed to fetch',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/related?artistId=607f1f77bcf86cd799439013'
    );
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));

    expect(response.status).toBe(500);
  });

  it('should return 500 when an exception is thrown', async () => {
    vi.mocked(ReleaseService.getArtistOtherReleases).mockRejectedValue(new Error('Unexpected'));

    const request = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/related?artistId=607f1f77bcf86cd799439013'
    );
    const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
