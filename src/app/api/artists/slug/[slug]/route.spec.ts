// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';
import { ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';
import {
  artistPrivateValues,
  artistPublicScalar,
  artistScalar,
  artistWithPublishedReleases,
  digitalFormat,
  digitalFormatFile,
  release,
} from '@/lib/validation/media/schema-fixtures';
import { artistPublicScalarSchema } from '@/lib/validation/media/shared-schema';

import { GET } from './route';

// Pass-through limiter: this file issues more requests than PUBLIC_LIMIT.
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  withRateLimit:
    (_limiter: unknown, _limit: number) =>
    (handler: (...args: unknown[]) => unknown) =>
    (req: unknown, ctx: unknown) =>
      handler(req, ctx),
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistBySlug: vi.fn(),
    getArtistBySlugWithReleases: vi.fn(),
  },
}));

describe('Artist by Slug API Route', () => {
  /** A full artist row as a bare Prisma read returns it — private fields populated. */
  const mockArtist = { ...artistScalar, ...artistPrivateValues };

  const createParams = (slug: string) => ({
    params: Promise.resolve({ slug }),
  });
  describe('GET /api/artists/slug/[slug]', () => {
    it('should return an artist by slug', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(200);
      // The route guard coerces ISO strings to Date (serialised by the real
      // NextResponse; the mock returns the object as-is).
      expect(data).toEqual(artistPublicScalarSchema.parse(artistPublicScalar));
      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-doe');
    });

    it.each(ARTIST_PRIVATE_FIELDS)(
      'never serialises the private field %s, even when the service returns it',
      async (field) => {
        vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
          success: true,
          data: mockArtist as never,
        });

        const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
        const response = await GET(request, createParams('john-doe'));
        const data = await response.json();

        expect(data).not.toHaveProperty(field);
      }
    );

    it('keeps the public shared cache header', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));

      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=300'
      );
    });

    it('should return 404 when artist not found', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: false,
        error: 'Artist not found',
        code: 'NOT_FOUND',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Artist not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: false,
        error: 'Failed to retrieve artist',
        code: 'UNKNOWN',
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockRejectedValueOnce(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle slugs with multiple segments', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-michael-doe');
      const response = await GET(request, createParams('john-michael-doe'));

      expect(response.status).toBe(200);
      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-michael-doe');
    });
  });

  describe('GET /api/artists/slug/[slug]?withReleases=true', () => {
    /** The detail graph with every artist on it — the artist, a band member,
     * and a release credit — carrying populated private fields. */
    const mockArtistWithReleases = {
      ...artistWithPublishedReleases,
      ...artistPrivateValues,
      members: [{ id: 'am1', artistId: 'a1', memberId: 'a2', member: { ...mockArtist, id: 'a2' } }],
      releases: [
        {
          id: 'ar1',
          artistId: 'a1',
          releaseId: 'r1',
          credit: 'primary' as const,
          release: {
            ...release,
            artistReleases: [{ id: 'ar1', artistId: 'a1', releaseId: 'r1', artist: mockArtist }],
            digitalFormats: [
              { ...digitalFormat, files: [{ ...digitalFormatFile, fileSize: 42n }] },
            ],
          },
        },
      ],
    };

    const getWithReleases = async (): Promise<Record<string, unknown>> => {
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValueOnce({
        success: true,
        data: mockArtistWithReleases as never,
      });
      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/john-doe?withReleases=true'
      );
      const response = await GET(request, createParams('john-doe'));
      return response.json();
    };

    it.each(ARTIST_PRIVATE_FIELDS)(
      'never serialises %s on any artist in the graph',
      async (field) => {
        const data = (await getWithReleases()) as {
          members: Array<{ member: object }>;
          releases: Array<{ release: { artistReleases: Array<{ artist: object }> } }>;
        };
        const artists = [
          data,
          ...data.members.map(({ member }) => member),
          ...data.releases.flatMap(({ release: row }) =>
            row.artistReleases.map(({ artist }) => artist)
          ),
        ];

        expect(artists.filter((artist) => field in artist)).toEqual([]);
      }
    );

    it('serialises BigInt file sizes to numbers', async () => {
      const data = (await getWithReleases()) as {
        releases: Array<{
          release: { digitalFormats: Array<{ files: Array<{ fileSize: unknown }> }> };
        }>;
      };

      expect(data.releases[0].release.digitalFormats[0].files[0].fileSize).toBe(42);
    });

    it('returns 500 without the payload when the graph fails the public schema', async () => {
      const { members: _members, ...malformed } = mockArtistWithReleases;
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValueOnce({
        success: true,
        data: malformed as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/john-doe?withReleases=true'
      );
      const response = await GET(request, createParams('john-doe'));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Internal server error' });
    });

    it('should call getArtistBySlugWithReleases when withReleases=true', async () => {
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValueOnce({
        success: true,
        data: mockArtistWithReleases as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/john-doe?withReleases=true'
      );
      const response = await GET(request, createParams('john-doe'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.releases).toHaveLength(1);
      expect(ArtistService.getArtistBySlugWithReleases).toHaveBeenCalledWith('john-doe');
      expect(ArtistService.getArtistBySlug).not.toHaveBeenCalled();
    });

    it('should call getArtistBySlug when withReleases is not set', async () => {
      vi.mocked(ArtistService.getArtistBySlug).mockResolvedValueOnce({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists/slug/john-doe');
      await GET(request, createParams('john-doe'));

      expect(ArtistService.getArtistBySlug).toHaveBeenCalledWith('john-doe');
      expect(ArtistService.getArtistBySlugWithReleases).not.toHaveBeenCalled();
    });

    it('should return 404 when artist not found with releases', async () => {
      vi.mocked(ArtistService.getArtistBySlugWithReleases).mockResolvedValueOnce({
        success: false,
        error: 'Artist not found',
        code: 'NOT_FOUND',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists/slug/no-one?withReleases=true'
      );
      const response = await GET(request, createParams('no-one'));

      expect(response.status).toBe(404);
    });

    it('should return 400 when slug format is invalid', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists/slug/INVALID%20SLUG!');
      const response = await GET(request, createParams('INVALID SLUG!'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid slug format' });
    });
  });
});
