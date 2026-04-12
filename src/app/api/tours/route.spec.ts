// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TourRepository } from '@/lib/repositories/tours/tour-repository';

import { GET } from './route';

vi.mock('server-only', () => ({}));

// Mock rate limiting to pass through
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) => (handler: Function) => (req: unknown, ctx: unknown) =>
      handler(req, ctx),
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: {},
  PUBLIC_LIMIT: 100,
}));

vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: {
    findAll: vi.fn(),
  },
}));

describe('GET /api/tours', () => {
  const dummyRequest = new NextRequest('http://localhost/api/tours');
  const dummyContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockTours = [
    { id: 'tour-1', name: 'Summer Tour', tourDates: [] },
    { id: 'tour-2', name: 'Winter Tour', tourDates: [] },
  ];

  it('should return all tours', async () => {
    vi.mocked(TourRepository.findAll).mockResolvedValue(mockTours as never);

    const response = await GET(dummyRequest, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tours: mockTours, count: 2 });
    expect(TourRepository.findAll).toHaveBeenCalledWith({ limit: 100 });
  });

  it('should include Cache-Control header', async () => {
    vi.mocked(TourRepository.findAll).mockResolvedValue([] as never);

    const response = await GET(dummyRequest, dummyContext);

    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=60, stale-while-revalidate=300'
    );
  });

  it('should return empty array when no tours', async () => {
    vi.mocked(TourRepository.findAll).mockResolvedValue([] as never);

    const response = await GET(dummyRequest, dummyContext);
    const data = await response.json();

    expect(data).toEqual({ tours: [], count: 0 });
  });

  it('should return 500 when an exception is thrown', async () => {
    vi.mocked(TourRepository.findAll).mockRejectedValue(new Error('DB error'));

    const response = await GET(dummyRequest, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
