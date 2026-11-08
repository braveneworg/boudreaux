// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { tourImages } from '@/lib/services/tours/tour-images/tour-images';

import { GET } from './route';

vi.mock('server-only', () => ({}));

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

vi.mock('@/lib/services/tours/tour-images/tour-images', () => ({
  tourImages: { list: vi.fn() },
}));

describe('Tour Date Images API Route', () => {
  const createParams = (tourId: string, tourDateId: string) => ({
    params: Promise.resolve({ tourId, tourDateId }),
  });
  describe('GET /api/tours/[tourId]/dates/[tourDateId]/images', () => {
    afterEach(() => {
      authState.isAdmin = true;
    });

    it("refuses an anonymous visitor and reads nothing: a hidden tour date's images are not public", async () => {
      authState.isAdmin = false;

      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/507f1f77bcf86cd799439022/images'
        ),
        createParams('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
      );

      expect({ status: response.status, reads: vi.mocked(tourImages.list).mock.calls }).toEqual({
        status: 401,
        reads: [],
      });
    });

    it('answers an admin privately, never from a shared cache', async () => {
      vi.mocked(tourImages.list).mockResolvedValueOnce({ success: true, data: [] });

      const response = await GET(
        new NextRequest(
          'http://localhost:3000/api/tours/507f1f77bcf86cd799439011/dates/507f1f77bcf86cd799439022/images'
        ),
        createParams('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
      );

      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

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
