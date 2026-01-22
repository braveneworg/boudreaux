// @vitest-environment node
import { NextRequest } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';

import { GET, PATCH, DELETE } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getReleaseById: vi.fn(),
    updateRelease: vi.fn(),
    deleteRelease: vi.fn(),
  },
}));

describe('Release by ID API Routes', () => {
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

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/releases/[id]', () => {
    it('should return a release by ID', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123');
      const response = await GET(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockRelease);
      expect(ReleaseService.getReleaseById).toHaveBeenCalledWith('release-123');
    });

    it('should return 404 when release not found', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Release not found',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Release not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123');
      const response = await GET(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve release',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123');
      const response = await GET(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve release' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.getReleaseById).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/releases/release-123');
      const response = await GET(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/releases/[id]', () => {
    it('should update a release successfully', async () => {
      const updatedRelease = { ...mockRelease, title: 'Updated Album' };
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: updatedRelease as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Album' }),
      });
      const response = await PATCH(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedRelease);
      expect(ReleaseService.updateRelease).toHaveBeenCalledWith('release-123', {
        title: 'Updated Album',
      });
    });

    it('should return 404 when release not found', async () => {
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Release not found',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/non-existent', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Album' }),
      });
      const response = await PATCH(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Release not found' });
    });

    it('should return 409 when title already exists', async () => {
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Release with this title already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Existing Album' }),
      });
      const response = await PATCH(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Release with this title already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Album' }),
      });
      const response = await PATCH(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: false,
        error: 'Failed to update release',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Album' }),
      });
      const response = await PATCH(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update release' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.updateRelease).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Album' }),
      });
      const response = await PATCH(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates', async () => {
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { ...mockRelease, description: 'Updated description' } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ description: 'Updated description' }),
      });
      const response = await PATCH(request, createParams('release-123'));

      expect(response.status).toBe(200);
      expect(ReleaseService.updateRelease).toHaveBeenCalledWith('release-123', {
        description: 'Updated description',
      });
    });

    it('should handle publishedAt update', async () => {
      const publishDate = new Date().toISOString();
      vi.mocked(ReleaseService.updateRelease).mockResolvedValue({
        success: true,
        data: { ...mockRelease, publishedAt: publishDate } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'PATCH',
        body: JSON.stringify({ publishedAt: publishDate }),
      });
      const response = await PATCH(request, createParams('release-123'));

      expect(response.status).toBe(200);
      expect(ReleaseService.updateRelease).toHaveBeenCalledWith('release-123', {
        publishedAt: publishDate,
      });
    });
  });

  describe('DELETE /api/releases/[id]', () => {
    it('should delete a release successfully', async () => {
      vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
        success: true,
        data: mockRelease as never,
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Release deleted successfully' });
      expect(ReleaseService.deleteRelease).toHaveBeenCalledWith('release-123');
    });

    it('should return 404 when release not found', async () => {
      vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
        success: false,
        error: 'Release not found',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Release not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
        success: false,
        error: 'Failed to delete release',
      });

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete release' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(ReleaseService.deleteRelease).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/releases/release-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('release-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
