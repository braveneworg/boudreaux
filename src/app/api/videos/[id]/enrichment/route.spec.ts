// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: unknown) => handler,
}));

vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { getEnrichmentStatus: vi.fn() },
}));

const VIDEO_ID = 'f'.repeat(24);
const request = new NextRequest(`http://localhost/api/videos/${VIDEO_ID}/enrichment`);
const context = { params: Promise.resolve({ id: VIDEO_ID }) };

const status = {
  status: 'processing',
  error: null,
  progress: null,
  enrichedAt: null,
  currentReleasedOn: '2021-04-09',
  artists: [],
  suggestions: [],
};

describe('GET /api/videos/[id]/enrichment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the enrichment status for the video', async () => {
    vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockResolvedValue(status as never);

    const response = await GET(request, context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(status);
    expect(VideoEnrichmentService.getEnrichmentStatus).toHaveBeenCalledWith(VIDEO_ID);
  });

  it('returns 404 when the video does not exist', async () => {
    vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockResolvedValue(null);

    const response = await GET(request, context);

    expect(response.status).toBe(404);
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(VideoEnrichmentService.getEnrichmentStatus).mockRejectedValue(new Error('down'));

    const response = await GET(request, context);

    expect(response.status).toBe(500);
  });
});
