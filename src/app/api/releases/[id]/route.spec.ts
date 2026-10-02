// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';

import { GET } from './route';

// Mock server-only to prevent client component error in tests
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
          ? handler(args[0], args[1], { user: { id: 'admin-1', role: 'admin' } })
          : Response.json({ error: 'Unauthorized' }, { status: 401 }),
  };
});

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getReleaseById: vi.fn(),
    getReleaseWithTracks: vi.fn(),
    updateRelease: vi.fn(),
    deleteRelease: vi.fn(),
  },
}));

describe('Release by ID API Routes', () => {
  const mockRelease = {
    id: '507f1f77bcf86cd799439011',
    title: 'Test Album',
    labels: ['Test Label'],
    releasedOn: new Date('2024-01-15').toISOString(),
    catalogNumber: 'TEST-001',
    coverArt: 'https://example.com/cover.jpg',
    description: 'A test album description',
    downloadUrls: [],
    formats: ['DIGITAL', 'VINYL'],
    extendedData: [],
    images: [],
    notes: [],
    executiveProducedBy: [],
    coProducedBy: [],
    masteredBy: [],
    mixedBy: [],
    recordedBy: [],
    artBy: [],
    designBy: [],
    photographyBy: [],
    linerNotesBy: [],
    imageTypes: [],
    variants: [],
    digitalFormats: [],
    artistReleases: [],
    releaseUrls: [],
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
    publishedAt: null,
    featuredOn: null,
    featuredUntil: null,
    featuredDescription: null,
    urls: [],
    featuredArtists: [],
    tagId: null,
  };

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });
  describe('GET /api/releases/[id]', () => {
    beforeEach(() => {
      authState.isAdmin = true;
    });

    // Without `withTracks` the payload is the full admin release graph — every
    // credited artist's full row (contact PII, notes, job tokens) and
    // unpublished releases — so only the edit form may read it (#765).
    it('rejects a non-admin request for the admin payload without reading it', async () => {
      authState.isAdmin = false;

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));

      expect(response.status).toBe(401);
      expect(ReleaseService.getReleaseById).not.toHaveBeenCalled();
    });

    it('never lets a shared cache store the admin payload', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValueOnce({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));

      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('serves the public withTracks payload to a non-admin, shared-cacheable', async () => {
      authState.isAdmin = false;
      vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValueOnce({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011?withTracks=true'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=300'
      );
    });

    it('should return a release by ID', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockRelease);
      expect(ReleaseService.getReleaseById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    });

    it('serializes BigInt fields to numbers in the response', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: true,
        data: { ...mockRelease, streamCount: 1000n } as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.streamCount).toBe(1000);
    });

    it('should return 404 when release not found', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Release not found',
        code: 'NOT_FOUND',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439012'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439012'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Release not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve release',
        code: 'UNKNOWN',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve release' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
      );
      const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    describe('withTracks=true', () => {
      it('should call getReleaseWithTracks when withTracks=true', async () => {
        const releaseWithTracks = { ...mockRelease, releaseTracks: [{ id: 'track-1' }] };
        vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
          success: true,
          data: releaseWithTracks as never,
        });

        const request = new NextRequest(
          'http://localhost:3000/api/releases/507f1f77bcf86cd799439011?withTracks=true'
        );
        const response = await GET(request, createParams('507f1f77bcf86cd799439011'));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.releaseTracks).toHaveLength(1);
        expect(ReleaseService.getReleaseWithTracks).toHaveBeenCalledWith(
          '507f1f77bcf86cd799439011'
        );
        expect(ReleaseService.getReleaseById).not.toHaveBeenCalled();
      });

      it('should call getReleaseById when withTracks is not set', async () => {
        vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
          success: true,
          data: mockRelease as never,
        });

        const request = new NextRequest(
          'http://localhost:3000/api/releases/507f1f77bcf86cd799439011'
        );
        await GET(request, createParams('507f1f77bcf86cd799439011'));

        expect(ReleaseService.getReleaseById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
        expect(ReleaseService.getReleaseWithTracks).not.toHaveBeenCalled();
      });

      it('should return 404 when release with tracks not found', async () => {
        vi.mocked(ReleaseService.getReleaseWithTracks).mockResolvedValue({
          success: false,
          error: 'Release not found',
          code: 'NOT_FOUND',
        });

        const request = new NextRequest(
          'http://localhost:3000/api/releases/507f1f77bcf86cd799439012?withTracks=true'
        );
        const response = await GET(request, createParams('507f1f77bcf86cd799439012'));

        expect(response.status).toBe(404);
      });
    });

    it('should return 400 when release ID is not a valid ObjectId', async () => {
      const request = new NextRequest('http://localhost:3000/api/releases/not-valid');
      const response = await GET(request, createParams('not-valid'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid release ID' });
    });
  });
});
