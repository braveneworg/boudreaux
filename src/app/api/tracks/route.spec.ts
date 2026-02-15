// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TrackService } from '@/lib/services/track-service';

import { GET, POST as postHandler } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock withAdmin decorator to bypass auth in tests
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: () => unknown) => handler,
}));

vi.mock('@/lib/services/track-service', () => ({
  TrackService: {
    getTracks: vi.fn(),
    getTracksCount: vi.fn(),
    createTrack: vi.fn(),
  },
}));

vi.mock('@/lib/utils/data-utils', () => ({
  extractFieldsWithValues: vi.fn((jsonPromise: Promise<unknown>) => jsonPromise),
}));

// Create POST reference after mocking
const POST = postHandler;

// Mock context for route handlers
const mockContext = { params: Promise.resolve({}) };

describe('Tracks API Routes', () => {
  const mockTrack = {
    id: 'track-123',
    title: 'Test Track',
    duration: 180,
    audioUrl: 'https://example.com/audio.mp3',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    images: [],
    releaseTracks: [],
    urls: [],
    artists: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tracks', () => {
    it('should return all tracks with default parameters', async () => {
      const mockTracks = [mockTrack];
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: mockTracks as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        tracks: mockTracks,
        count: 1,
        totalCount: 1,
        hasMore: false,
      });
      expect(TrackService.getTracks).toHaveBeenCalledWith({});
    });

    it('should handle pagination parameters', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 50,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks?skip=10&take=5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(TrackService.getTracks).toHaveBeenCalledWith({
        skip: 10,
        take: 5,
      });
      expect(data.hasMore).toBe(true);
    });

    it('should handle search parameter', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks?search=test');
      const _response = await GET(request);

      expect(TrackService.getTracks).toHaveBeenCalledWith({
        search: 'test',
      });
      expect(TrackService.getTracksCount).toHaveBeenCalledWith('test', undefined);
    });

    it('should handle releaseId parameter', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks?releaseId=release-456');
      await GET(request);

      expect(TrackService.getTracks).toHaveBeenCalledWith({
        releaseId: 'release-456',
      });
      expect(TrackService.getTracksCount).toHaveBeenCalledWith(undefined, 'release-456');
    });

    it('should handle both search and releaseId parameters', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 1,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/tracks?search=test&releaseId=release-456'
      );
      await GET(request);

      expect(TrackService.getTracks).toHaveBeenCalledWith({
        search: 'test',
        releaseId: 'release-456',
      });
      expect(TrackService.getTracksCount).toHaveBeenCalledWith('test', 'release-456');
    });

    it('should return empty search when search param is empty', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 0,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tracks).toEqual([]);
      expect(data.count).toBe(0);
      expect(TrackService.getTracksCount).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should calculate hasMore correctly when more tracks exist', async () => {
      const tracks = Array.from({ length: 20 }, (_, i) => ({
        ...mockTrack,
        id: `track-${i + 1}`,
      }));
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: tracks as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 50,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks?skip=0&take=20');
      const response = await GET(request);
      const data = await response.json();

      expect(data.hasMore).toBe(true); // 0 + 20 < 50
    });

    it('should calculate hasMore as false when no more tracks', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: true,
        data: 1,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks?skip=0&take=20');
      const response = await GET(request);
      const data = await response.json();

      expect(data.hasMore).toBe(false); // 0 + 1 < 1 is false
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve tracks',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve tracks' });
    });

    it('should fallback to data length when count fails', async () => {
      vi.mocked(TrackService.getTracks).mockResolvedValue({
        success: true,
        data: [mockTrack] as never,
      });
      vi.mocked(TrackService.getTracksCount).mockResolvedValue({
        success: false,
        error: 'Count failed',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.totalCount).toBe(1); // Fallback to data.length
      expect(data.hasMore).toBe(false);
    });

    it('should handle internal errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(TrackService.getTracks).mockRejectedValue(new Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/tracks');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(consoleSpy).toHaveBeenCalledWith('Track GET error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('POST /api/tracks', () => {
    const createValidRequestBody = () => ({
      title: 'New Track',
      duration: 200,
      audioUrl: 'https://example.com/new-audio.mp3',
      coverArt: 'https://example.com/new-cover.jpg',
      position: 1,
    });

    const createMockRequest = (body: Record<string, unknown>) => {
      return {
        json: () => Promise.resolve(body),
      } as unknown as NextRequest;
    };

    it('should create a track successfully', async () => {
      const requestBody = createValidRequestBody();
      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { ...mockTrack, ...requestBody } as never,
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.title).toBe('New Track');
      expect(TrackService.createTrack).toHaveBeenCalledWith({
        title: 'New Track',
        duration: 200,
        audioUrl: 'https://example.com/new-audio.mp3',
        coverArt: 'https://example.com/new-cover.jpg',
        position: 1,
      });
    });

    it('should create track without optional fields', async () => {
      const requestBody = {
        title: 'Minimal Track',
        duration: 100,
        audioUrl: 'https://example.com/audio.mp3',
      };
      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: true,
        data: { ...mockTrack, ...requestBody } as never,
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);

      expect(response.status).toBe(201);
      expect(TrackService.createTrack).toHaveBeenCalledWith({
        title: 'Minimal Track',
        duration: 100,
        audioUrl: 'https://example.com/audio.mp3',
        coverArt: undefined,
        position: 0,
      });
    });

    it('should return 400 when title is missing', async () => {
      const requestBody = {
        duration: 200,
        audioUrl: 'https://example.com/audio.mp3',
      };

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Title is required' });
    });

    it('should return 400 when duration is missing', async () => {
      const requestBody = {
        title: 'Test Track',
        audioUrl: 'https://example.com/audio.mp3',
      };

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Duration is required' });
    });

    it('should return 400 when duration is null', async () => {
      const requestBody = {
        title: 'Test Track',
        duration: null,
        audioUrl: 'https://example.com/audio.mp3',
      };

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Duration is required' });
    });

    it('should return 400 when audioUrl is missing', async () => {
      const requestBody = {
        title: 'Test Track',
        duration: 200,
      };

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Audio URL is required' });
    });

    it('should return 503 when database is unavailable', async () => {
      const requestBody = createValidRequestBody();
      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 400 for other service errors', async () => {
      const requestBody = createValidRequestBody();
      vi.mocked(TrackService.createTrack).mockResolvedValue({
        success: false,
        error: 'Track with this title already exists',
      });

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Track with this title already exists' });
    });

    it('should handle internal errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const requestBody = createValidRequestBody();
      vi.mocked(TrackService.createTrack).mockRejectedValue(new Error('Unexpected error'));

      const request = createMockRequest(requestBody);
      const response = await POST(request, mockContext);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
      expect(consoleSpy).toHaveBeenCalledWith('Track POST error:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
