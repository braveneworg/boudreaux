// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ImageRepository } from '@/lib/repositories/tours/image-repository';

import { GET } from './route';

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

vi.mock('@/lib/repositories/tours/image-repository', () => ({
  ImageRepository: {
    findByTourId: vi.fn(),
  },
}));

describe('Tour Images API Route', () => {
  const createParams = (tourId: string) => ({
    params: Promise.resolve({ tourId }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tours/[tourId]/images', () => {
    it('should return empty images array for invalid tour ID format', async () => {
      const request = new NextRequest('http://localhost:3000/api/tours/not-valid/images');
      const response = await GET(request, createParams('not-valid'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ images: [] });
      expect(ImageRepository.findByTourId).not.toHaveBeenCalled();
    });

    it('should accept valid 24-char hex ObjectId', async () => {
      const mockImages = [{ id: 'img-1', url: 'https://example.com/img.jpg' }];
      vi.mocked(ImageRepository.findByTourId).mockResolvedValue(mockImages as never);

      const request = new NextRequest(
        'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/images'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ images: mockImages });
      expect(ImageRepository.findByTourId).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ImageRepository.findByTourId).mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/images'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch tour images' });
    });
  });
});
