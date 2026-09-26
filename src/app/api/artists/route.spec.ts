// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { ArtistService } from '@/lib/services/artist-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
// The decorator wraps handlers to add (request, context, session) signature
// We mock it to pass through the request only since inner handlers don't use context
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

// Mock auth for inline admin checks in GET handler
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: { check: vi.fn().mockResolvedValue(undefined) },
  PUBLIC_LIMIT: 30,
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtists: vi.fn(),
    createArtist: vi.fn(),
    listPublishedArtists: vi.fn(),
  },
}));

// The collection route is `withRateLimit(...)(handler)`, whose type requires a
// route context second argument; the handler ignores its params.
const emptyContext = { params: Promise.resolve({}) };

// Create POST reference after mocking
const POST = postHandler;

describe('Artist API Routes', () => {
  // Simplified mock without relations for testing - service is mocked anyway
  const mockArtist = {
    id: 'artist-123',
    firstName: 'John',
    middleName: null,
    surname: 'Doe',
    akaNames: null,
    displayName: 'John Doe',
    title: null,
    suffix: null,
    phone: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    bio: null,
    shortBio: null,
    altBio: null,
    slug: 'john-doe',
    genres: null,
    bornOn: null,
    diedOn: null,
    publishedOn: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    archivedAt: null,
    deactivatedAt: null,
    reactivatedAt: null,
    notes: [],
    tags: null,
    isPseudonymous: false,
    isActive: true,
    instruments: null,
    trackId: null,
    featuredArtistId: null,
  };
  describe('GET /api/artists', () => {
    it('should return 401 when not authenticated', async () => {
      vi.mocked(auth).mockResolvedValueOnce(null as never);

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Authentication required' });
      expect(ArtistService.getArtists).not.toHaveBeenCalled();
    });

    it('should return 401 when user role is not admin', async () => {
      vi.mocked(auth).mockResolvedValueOnce({
        user: { id: 'user-1', role: 'user', email: 'user@example.com', name: 'User' },
      } as never);

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data).toEqual({ error: 'Authentication required' });
      expect(ArtistService.getArtists).not.toHaveBeenCalled();
    });

    it('should return a paginated page of artists with default parameters', async () => {
      const mockArtists = [mockArtist];
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: mockArtists as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      // A short page (rows.length < take) yields nextSkip null.
      expect(data).toEqual({
        rows: mockArtists,
        nextSkip: null,
      });
      expect(ArtistService.getArtists).toHaveBeenCalledWith({ skip: 0, take: 24 });
    });

    it('should return the next offset when a full page is returned', async () => {
      const fullPage = Array.from({ length: 2 }, (_, i) => ({ ...mockArtist, id: `artist-${i}` }));
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: fullPage as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?skip=0&take=2');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(data.nextSkip).toBe(2);
    });

    it('should include Cache-Control: private, no-store header on successful GET response', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?skip=10&take=5');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
      });
    });

    it('should handle search parameter', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?search=john');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 0,
        take: 24,
        search: 'john',
      });
    });

    it('should parse published=true into a boolean filter', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?published=true');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith(
        expect.objectContaining({ published: true })
      );
    });

    it('should parse published=false into a boolean filter', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?published=false');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith(
        expect.objectContaining({ published: false })
      );
    });

    it('should pass deleted=true when requested', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?deleted=true');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: true })
      );
    });

    it('should handle multiple query parameters', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/artists?skip=5&take=10&search=doe'
      );
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 5,
        take: 10,
        search: 'doe',
      });
    });

    it('should return empty array when no artists found', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        rows: [],
        nextSkip: null,
      });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve artists',
        code: 'UNKNOWN',
      });

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve artists' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.getArtists).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists');
      const response = await GET(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should cap take parameter to 100', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?take=500');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 0,
        take: 100,
      });
    });

    it('should clamp negative skip to 0', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?skip=-5');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 0,
        take: 24,
      });
    });

    it('should fall back to defaults for invalid numeric parameters', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists?skip=invalid&take=abc');
      const response = await GET(request, emptyContext);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: 0,
        take: 24,
      });
    });
  });

  describe('GET /api/artists?listing=published', () => {
    const listingRow = {
      id: 'artist-1',
      slug: 'e2e-artist',
      firstName: 'E2E',
      middleName: null,
      surname: 'Artist',
      title: null,
      suffix: null,
      displayName: 'E2E Artist',
      akaNames: null,
      genres: null,
      instruments: null,
      shortBio: null,
      bornOn: null,
      diedOn: null,
      formedOn: null,
      bioImages: [],
      members: [],
      memberOf: [],
      releaseCount: 1,
      newestRelease: { id: 'r-1', title: 'LP', releasedOn: new Date('2024-01-01') },
    };

    const callPublished = (query = '') =>
      GET(
        new NextRequest(`http://localhost:3000/api/artists?listing=published${query}`),
        emptyContext
      );

    beforeEach(() => {
      vi.mocked(ArtistService.listPublishedArtists).mockResolvedValue({
        success: true,
        data: [],
      });
    });

    it('serves the published listing without consulting auth at all', async () => {
      vi.mocked(auth).mockClear();

      const response = await callPublished();

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it('calls the listing service with the default A–Z page of current artists', async () => {
      await callPublished();

      expect(ArtistService.listPublishedArtists).toHaveBeenCalledWith({
        sort: 'alpha',
        roster: 'current',
        skip: 0,
        take: 24,
      });
    });

    it('forwards a trimmed search term, the sort, the roster, and the pagination', async () => {
      await callPublished('&search=%20punk%20&sort=newest&roster=alumni&skip=24&take=12');

      expect(ArtistService.listPublishedArtists).toHaveBeenCalledWith({
        search: 'punk',
        sort: 'newest',
        roster: 'alumni',
        skip: 24,
        take: 12,
      });
    });

    it('degrades a malformed listing query to defaults instead of a 400', async () => {
      const response = await callPublished('&sort=sideways&roster=retired&skip=nope&take=500');

      expect(response.status).toBe(200);
      expect(ArtistService.listPublishedArtists).toHaveBeenCalledWith({
        sort: 'alpha',
        roster: 'current',
        skip: 0,
        take: 100,
      });
    });

    it('returns the rows with a null nextSkip for a short page', async () => {
      vi.mocked(ArtistService.listPublishedArtists).mockResolvedValue({
        success: true,
        data: [listingRow],
      });

      const response = await callPublished();
      const data = await response.json();

      expect(data.rows).toHaveLength(1);
      expect(data.nextSkip).toBeNull();
    });

    it('returns the next offset when a full page comes back', async () => {
      vi.mocked(ArtistService.listPublishedArtists).mockResolvedValue({
        success: true,
        data: [listingRow],
      });

      const response = await callPublished('&take=1');
      const data = await response.json();

      expect(data.nextSkip).toBe(1);
    });

    it('never ships contact fields on a listing row', async () => {
      vi.mocked(ArtistService.listPublishedArtists).mockResolvedValue({
        success: true,
        data: [listingRow],
      });

      const response = await callPublished();
      const data = await response.json();

      expect(data.rows[0]).not.toHaveProperty('email');
      expect(data.rows[0]).not.toHaveProperty('phone');
      expect(data.rows[0]).not.toHaveProperty('address1');
    });

    it('sets a shared, short-lived Cache-Control header on the public listing', async () => {
      const response = await callPublished();

      expect(response.headers.get('Cache-Control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=300'
      );
    });

    it('maps a database-unavailable failure to 503', async () => {
      vi.mocked(ArtistService.listPublishedArtists).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const response = await callPublished();

      expect(response.status).toBe(503);
    });

    it('maps a thrown error to 500', async () => {
      vi.mocked(ArtistService.listPublishedArtists).mockRejectedValueOnce(new Error('boom'));

      const response = await callPublished();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('does not call the admin listing for the published branch', async () => {
      await callPublished();

      expect(ArtistService.getArtists).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/artists', () => {
    it('should create an artist successfully', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          displayName: 'John Doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockArtist);
      expect(ArtistService.createArtist).toHaveBeenCalledWith({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        displayName: 'John Doe',
      });
    });

    it('should return 400 when firstName is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 400 when surname is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 400 when slug is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 409 when slug already exists', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
        code: 'DUPLICATE',
      });

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Artist with this slug already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Failed to create artist',
        code: 'UNKNOWN',
      });

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create artist' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.createArtist).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should accept additional optional fields', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          displayName: 'John Doe',
          bio: 'A musician',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });

      expect(response.status).toBe(201);
      expect(ArtistService.createArtist).toHaveBeenCalledWith({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        displayName: 'John Doe',
        bio: 'A musician',
      });
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
    });

    it('should handle empty string values as invalid', async () => {
      const request = new NextRequest('http://localhost:3000/api/artists', {
        method: 'POST',
        body: JSON.stringify({
          firstName: '',
          surname: '',
          slug: '',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toEqual(expect.any(Array));
    });
  });
});
