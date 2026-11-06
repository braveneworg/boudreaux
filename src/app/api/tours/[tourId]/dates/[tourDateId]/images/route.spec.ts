// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { tourImages } from '@/lib/services/tours/tour-images/tour-images';

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

vi.mock('@/lib/services/tours/tour-images/tour-images', () => ({
  tourImages: { list: vi.fn() },
}));

describe('Tour Date Images API Route', () => {
  const createParams = (tourId: string, tourDateId: string) => ({
    params: Promise.resolve({ tourId, tourDateId }),
  });
  describe('GET /api/tours/[tourId]/dates/[tourDateId]/images', () => {
    it('should return empty images array for invalid tour ID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/tours/not-valid/dates/507f1f77bcf86cd799439022/images'
      );
      const response = await GET(request, createParams('not-valid', '507f1f77bcf86cd799439022'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ images: [] });
      expect(tourImages.list).not.toHaveBeenCalled();
    });

    it('should return empty images array for invalid tour date ID format', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/not-valid/images'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011', 'not-valid'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ images: [] });
      expect(tourImages.list).not.toHaveBeenCalled();
    });

    it('should accept valid 24-char hex ObjectIds', async () => {
      const mockImages = [{ id: 'img-1', url: 'https://example.com/img.jpg' }];
      vi.mocked(tourImages.list).mockResolvedValueOnce({
        success: true,
        data: mockImages as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/507f1f77bcf86cd799439022/images'
      );
      const response = await GET(
        request,
        createParams('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ images: mockImages });
      expect(tourImages.list).toHaveBeenCalledWith({
        kind: 'tourDate',
        id: '507f1f77bcf86cd799439022',
      });
    });

    it('answers a failed read with the status its code maps to', async () => {
      vi.mocked(tourImages.list).mockResolvedValueOnce({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/507f1f77bcf86cd799439022/images'
        ),
        createParams('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
      );

      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 503,
        body: { error: 'Failed to fetch tour date images' },
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(tourImages.list).mockRejectedValueOnce(new Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/507f1f77bcf86cd799439022/images'
      );
      const response = await GET(
        request,
        createParams('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch tour date images' });
    });
  });
});
