// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ImageLinksService } from '@/lib/services/image-links-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/services/image-links-service', () => ({
  ImageLinksService: { getStatus: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({ loggers: { media: { error: vi.fn() } } }));

const request = new NextRequest('http://localhost/api/artists/a1/image-links');
const context = { params: Promise.resolve({ id: 'a1' }) };

describe('GET /api/artists/[id]/image-links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the image-links status for the artist', async () => {
    const status = { status: 'processing' as const, error: null, addedCount: null, links: [] };
    vi.mocked(ImageLinksService.getStatus).mockResolvedValue(status);

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(status);
    expect(ImageLinksService.getStatus).toHaveBeenCalledWith('a1');
  });

  it('returns 404 when the artist does not exist', async () => {
    vi.mocked(ImageLinksService.getStatus).mockResolvedValue(null);

    const response = await GET(request, context);

    expect(response.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(ImageLinksService.getStatus).mockRejectedValue(new Error('DB down'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
