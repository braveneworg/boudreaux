// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TourRepository } from '@/lib/repositories/tours/tour-repository';

import { GET } from './route';

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

// Model withAdmin: pass through for an admin, 401 otherwise.
const authState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/lib/decorators/with-auth', async () => {
  const { NextResponse: Response } = await import('next/server');
  return {
    withAdmin:
      (handler: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        authState.isAdmin
          ? handler(...args)
          : Response.json({ error: 'Authentication required' }, { status: 401 }),
  };
});

vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: {
    findById: vi.fn(),
    findPublicById: vi.fn(),
  },
}));

describe('Tour by ID API Route', () => {
  const mockTour = {
    id: '507f1f77bcf86cd799439011',
    name: 'Test Tour',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createParams = (tourId: string) => ({
    params: Promise.resolve({ tourId }),
  });
  describe('GET /api/tours/[tourId]?scope=admin (ADR-0015)', () => {
    const tourId = '507f1f77bcf86cd799439011';
    const getAdmin = (): Promise<Response> =>
      GET(
        new NextRequest(`http://localhost:3000/api/tours/${tourId}?scope=admin`),
        createParams(tourId)
      ) as Promise<Response>;

    beforeEach(() => {
      vi.mocked(TourRepository.findById).mockResolvedValue(mockTour as never);
    });

    afterEach(() => {
      authState.isAdmin = true;
      vi.mocked(TourRepository.findById).mockReset();
      vi.mocked(TourRepository.findPublicById).mockReset();
    });

    it('gives an admin the unfiltered tour', async () => {
      await getAdmin();

      expect({
        admin: vi.mocked(TourRepository.findById).mock.calls,
        public: vi.mocked(TourRepository.findPublicById).mock.calls,
      }).toEqual({ admin: [[tourId]], public: [] });
    });

    it('is never shared-cached', async () => {
      const response = await getAdmin();

      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('refuses a visitor who is not an admin, without reading', async () => {
      authState.isAdmin = false;

      const response = await getAdmin();

      expect({
        status: response.status,
        reads: vi.mocked(TourRepository.findById).mock.calls,
      }).toEqual({ status: 401, reads: [] });
    });

    it('returns 404 when the tour does not exist', async () => {
      vi.mocked(TourRepository.findById).mockResolvedValueOnce(null);

      const response = await getAdmin();

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/tours/[tourId] public read (ADR-0015)', () => {
    it('reads the tour as the public may see it', async () => {
      vi.mocked(TourRepository.findPublicById).mockResolvedValueOnce(mockTour as never);

      await GET(
        new NextRequest('http://localhost:3000/api/tours/507f1f77bcf86cd799439011'),
        createParams('507f1f77bcf86cd799439011')
      );

      expect(vi.mocked(TourRepository.findById).mock.calls).toEqual([]);
    });
  });

  describe('GET /api/tours/[tourId]', () => {
    it('should return 400 for invalid tour ID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/tours/not-valid');
      const response = await GET(request, createParams('not-valid'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid tour ID' });
      expect(TourRepository.findPublicById).not.toHaveBeenCalled();
    });

    it('should accept valid 24-char hex ObjectId', async () => {
      vi.mocked(TourRepository.findPublicById).mockResolvedValue(mockTour as never);

      const request = new NextRequest('http://localhost:3000/api/tours/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ tour: mockTour });
      expect(TourRepository.findPublicById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should return 404 when tour not found', async () => {
      vi.mocked(TourRepository.findPublicById).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/tours/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Tour not found' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(TourRepository.findPublicById).mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/tours/507f1f77bcf86cd799439011');
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch tour' });
    });
  });
});
