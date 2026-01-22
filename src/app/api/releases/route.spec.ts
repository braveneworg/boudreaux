// @vitest-environment node
import { NextRequest } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: Function) => handler,
}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getReleases: vi.fn(),
    createRelease: vi.fn(),
  },
}));

// Create POST reference after mocking
const POST = postHandler;

// Empty context for routes without dynamic params
const emptyContext = { params: Promise.resolve({}) };

describe('Release API Routes', () => {
  const mockRelease = {
    id: 'release-123',
    title: 'Test Album',
    labels: ['Test Label'],
    releasedOn: new Date('2024-01-15'),
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
    releaseTracks: [],
    artistReleases: [],
    releaseUrls: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    publishedAt: null,
    featuredOn: null,
    featuredUntil: null,
    featuredDescription: null,
    urls: [],
    featuredArtists: [],
    tagId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/releases', () => {
    it('should return all releases with default parameters', async () => {
      const mockReleases = [mockRelease];
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: mockReleases as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        releases: mockReleases,
        count: 1,
      });
      expect(ReleaseService.getReleases).toHaveBeenCalledWith({});
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: [mockRelease] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases?skip=10&take=5');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ReleaseService.getReleases).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
      });
    });

    it('should handle search parameter', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: [mockRelease] as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases?search=test');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ReleaseService.getReleases).toHaveBeenCalledWith({
        search: 'test',
      });
    });

    it('should handle multiple query parameters', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: [mockRelease] as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases?skip=5&take=10&search=album'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ReleaseService.getReleases).toHaveBeenCalledWith({
        skip: 5,
        take: 10,
        search: 'album',
      });
    });

    it('should return empty array when no releases found', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: [],
      });

      const request = new NextRequest('http://localhost:3000/api/releases');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        releases: [],
        count: 0,
      });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/releases');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve releases',
      });

      const request = new NextRequest('http://localhost:3000/api/releases');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve releases' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.getReleases).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/releases');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle invalid numeric parameters gracefully', async () => {
      vi.mocked(ReleaseService.getReleases).mockResolvedValue({
        success: true,
        data: [mockRelease] as never,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/releases?skip=invalid&take=abc'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(ReleaseService.getReleases).toHaveBeenCalledWith({
        skip: NaN,
        take: NaN,
      });
    });
  });

  describe('POST /api/releases', () => {
    it('should create a release successfully', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
          formats: ['DIGITAL'],
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(mockRelease);
      expect(ReleaseService.createRelease).toHaveBeenCalledWith({
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL'],
      });
    });

    it('should return 400 when title is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Title is required' });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });

    it('should return 400 when releasedOn is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Release date is required' });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });

    it('should return 400 when coverArt is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Cover art is required' });
      expect(ReleaseService.createRelease).not.toHaveBeenCalled();
    });

    it('should return 400 when title already exists', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Release with this title already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Release with this title already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: false,
        error: 'Failed to create release',
      });

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Failed to create release' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.createRelease).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
        }),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should accept additional optional fields', async () => {
      vi.mocked(ReleaseService.createRelease).mockResolvedValue({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Album',
          releasedOn: '2024-01-15',
          coverArt: 'https://example.com/cover.jpg',
          formats: ['DIGITAL', 'VINYL'],
          labels: ['Test Label'],
          catalogNumber: 'TEST-001',
          description: 'A test album',
        }),
      });

      const response = await POST(request, emptyContext);

      expect(response.status).toBe(201);
      expect(ReleaseService.createRelease).toHaveBeenCalledWith({
        title: 'Test Album',
        releasedOn: '2024-01-15',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL', 'VINYL'],
        labels: ['Test Label'],
        catalogNumber: 'TEST-001',
        description: 'A test album',
      });
    });

    it('should handle empty request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/releases', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request, emptyContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Title is required' });
    });
  });
});
