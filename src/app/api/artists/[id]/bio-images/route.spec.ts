// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { listBioImages: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const artistId = '507f1f77bcf86cd799439011';
const request = new NextRequest(`http://localhost/api/artists/${artistId}/bio-images`);
const context = { params: Promise.resolve({ id: artistId }) };

describe('GET /api/artists/[id]/bio-images', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the artist bio image pool in picker order', async () => {
    const rows = [{ id: 'img-1', url: 'https://cdn/x.webp', displayOrder: 0 }];
    vi.mocked(ArtistService.listBioImages).mockResolvedValue({
      success: true,
      data: rows as never,
    });

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(rows);
    expect(ArtistService.listBioImages).toHaveBeenCalledWith(artistId);
  });

  it('returns 400 for a malformed artist id without calling the service', async () => {
    const response = await GET(request, { params: Promise.resolve({ id: 'nope' }) });

    expect(response.status).toBe(400);
    expect(ArtistService.listBioImages).not.toHaveBeenCalled();
  });

  it('returns 404 when the artist does not exist', async () => {
    vi.mocked(ArtistService.listBioImages).mockResolvedValue({
      success: false,
      error: 'Artist not found',
      code: 'NOT_FOUND',
    });

    const response = await GET(request, context);

    expect(response.status).toBe(404);
  });

  it('returns 500 for any other service failure', async () => {
    vi.mocked(ArtistService.listBioImages).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
      code: 'UNAVAILABLE',
    });

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(ArtistService.listBioImages).mockRejectedValue(new Error('DB down'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
