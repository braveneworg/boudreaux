// @vitest-environment node
import { NextRequest } from 'next/server';

import { ArtistService } from '@/lib/services/artist-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
// The decorator wraps handlers to add (request, context, session) signature
// We mock it to pass through the request only since inner handlers don't use context
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: (request: Request) => Promise<Response>) =>
    Promise.resolve((request: Request) => handler(request)),
}));

vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtists: vi.fn(),
    createArtist: vi.fn(),
  },
}));

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/artist', () => {
    it('should return all artists with default parameters', async () => {
      const mockArtists = [mockArtist];
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: mockArtists as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artist');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        artists: mockArtists,
        count: 1,
      });
      expect(ArtistService.getArtists).toHaveBeenCalledWith({});
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artist?skip=10&take=5');
      const response = await GET(request);

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

      const request = new NextRequest('http://localhost:3000/api/artist?search=john');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        search: 'john',
      });
    });

    it('should handle multiple query parameters', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artist?skip=5&take=10&search=doe');
      const response = await GET(request);

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

      const request = new NextRequest('http://localhost:3000/api/artist');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        artists: [],
        count: 0,
      });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/artist');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve artists',
      });

      const request = new NextRequest('http://localhost:3000/api/artist');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve artists' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ArtistService.getArtists).mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artist');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle invalid numeric parameters gracefully', async () => {
      vi.mocked(ArtistService.getArtists).mockResolvedValue({
        success: true,
        data: [mockArtist] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artist?skip=invalid&take=abc');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ArtistService.getArtists).toHaveBeenCalledWith({
        skip: NaN,
        take: NaN,
      });
    });
  });

  describe('POST /api/artist', () => {
    it('should create an artist successfully', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: true,
        data: mockArtist as never,
      });

      const request = new NextRequest('http://localhost:3000/api/artist', {
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
      const request = new NextRequest('http://localhost:3000/api/artist', {
        method: 'POST',
        body: JSON.stringify({
          surname: 'Doe',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'firstName, surname, and slug are required' });
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 400 when surname is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/artist', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          slug: 'john-doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'firstName, surname, and slug are required' });
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 400 when slug is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/artist', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
        }),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'firstName, surname, and slug are required' });
      expect(ArtistService.createArtist).not.toHaveBeenCalled();
    });

    it('should return 409 when slug already exists', async () => {
      vi.mocked(ArtistService.createArtist).mockResolvedValue({
        success: false,
        error: 'Artist with this slug already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/artist', {
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
      });

      const request = new NextRequest('http://localhost:3000/api/artist', {
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
      });

      const request = new NextRequest('http://localhost:3000/api/artist', {
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
      vi.mocked(ArtistService.createArtist).mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/artist', {
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

      const request = new NextRequest('http://localhost:3000/api/artist', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          displayName: 'John Doe',
          bio: 'A musician',
          country: 'US',
          isActive: true,
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
        country: 'US',
        isActive: true,
      });
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/artist', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({}) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'firstName, surname, and slug are required' });
    });

    it('should handle empty string values as invalid', async () => {
      const request = new NextRequest('http://localhost:3000/api/artist', {
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
      expect(data).toEqual({ error: 'firstName, surname, and slug are required' });
    });
  });
});
