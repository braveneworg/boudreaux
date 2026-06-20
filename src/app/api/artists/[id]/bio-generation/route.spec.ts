// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { BioGenerationService } from '@/lib/services/bio-generation-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: { getGenerationStatus: vi.fn() },
}));

const request = new NextRequest('http://localhost/api/artists/a1/bio-generation');
const context = { params: Promise.resolve({ id: 'a1' }) };

describe('GET /api/artists/[id]/bio-generation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the generation status for the artist', async () => {
    vi.mocked(BioGenerationService.getGenerationStatus).mockResolvedValue({
      status: 'processing',
      error: null,
      content: null,
    });

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'processing',
      error: null,
      content: null,
    });
    expect(BioGenerationService.getGenerationStatus).toHaveBeenCalledWith('a1');
  });

  it('returns 404 when the artist does not exist', async () => {
    vi.mocked(BioGenerationService.getGenerationStatus).mockResolvedValue(null);

    const response = await GET(request, context);

    expect(response.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(BioGenerationService.getGenerationStatus).mockRejectedValue(new Error('DB down'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
