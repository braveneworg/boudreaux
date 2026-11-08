// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TourService } from '@/lib/services/tours/tour-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

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
  publicLimiter: {},
  PUBLIC_LIMIT: 100,
}));

vi.mock('@/lib/services/tours/tour-service', () => ({
  TourService: {
    findPublicPage: vi.fn(),
  },
}));

describe('GET /api/tours', () => {
  const dummyContext = { params: Promise.resolve({}) };
  const makeRequest = (query = '') => new NextRequest(`http://localhost/api/tours${query}`);
  const mockTours = [
    { id: 'tour-1', name: 'Summer Tour', tourDates: [] },
    { id: 'tour-2', name: 'Winter Tour', tourDates: [] },
  ];

  it('returns a page of tours with a nextSkip cursor', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue(mockTours as never);

    const response = await GET(makeRequest('?skip=0&take=2'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    // A full page (rows.length === take) yields the next offset.
    expect(data).toEqual({ rows: mockTours, nextSkip: 2 });
    expect(TourService.findPublicPage).toHaveBeenCalledWith({
      skip: 0,
      take: 2,
      search: undefined,
    });
  });

  it('returns nextSkip null when a short page signals the end', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue(mockTours as never);

    const response = await GET(makeRequest('?skip=0&take=24'), dummyContext);
    const data = await response.json();

    expect(data.nextSkip).toBeNull();
  });

  it('forwards the search term and defaults skip to 0', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue([] as never);

    await GET(makeRequest('?search=Summer'), dummyContext);

    expect(TourService.findPublicPage).toHaveBeenCalledWith({
      skip: 0,
      take: 24,
      search: 'Summer',
    });
  });

  it('clamps take to the maximum of 100', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue([] as never);

    await GET(makeRequest('?take=500'), dummyContext);

    expect(TourService.findPublicPage).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('sets a no-store Cache-Control header', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue([] as never);

    const response = await GET(makeRequest(), dummyContext);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns an empty page when there are no tours', async () => {
    vi.mocked(TourService.findPublicPage).mockResolvedValue([] as never);

    const response = await GET(makeRequest(), dummyContext);
    const data = await response.json();

    expect(data).toEqual({ rows: [], nextSkip: null });
  });

  it('returns 500 when an exception is thrown', async () => {
    vi.mocked(TourService.findPublicPage).mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
