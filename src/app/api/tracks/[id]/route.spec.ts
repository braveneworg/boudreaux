// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { TrackService } from '@/lib/services/track-service';

import { GET, PATCH, DELETE } from './route';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/track-service', () => ({
  TrackService: {
    getTrackById: vi.fn(),
    updateTrack: vi.fn(),
    deleteTrack: vi.fn(),
  },
}));

describe('Track by ID API Routes', () => {
  const mockTrack = {
    id: 'track-123',
    title: 'Test Track',
    duration: 240,
    audioUrl: 'https://example.com/audio.mp3',
    coverArt: 'https://example.com/cover.jpg',
    position: 1,
    artistIds: [],
    releaseIds: [],
    publishedOn: null,
    createdBy: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const createParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/tracks/[id]', () => {
    it('should return a track by ID', async () => {
      vi.mocked(TrackService.getTrackById).mockResolvedValue({
        success: true,
        data: mockTrack as never,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123');
      const response = await GET(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockTrack);
      expect(TrackService.getTrackById).toHaveBeenCalledWith('track-123');
    });

    it('should return 404 when track not found', async () => {
      vi.mocked(TrackService.getTrackById).mockResolvedValue({
        success: false,
        error: 'Track not found',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/non-existent');
      const response = await GET(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Track not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(TrackService.getTrackById).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123');
      const response = await GET(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(TrackService.getTrackById).mockResolvedValue({
        success: false,
        error: 'Failed to retrieve track',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123');
      const response = await GET(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to retrieve track' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(TrackService.getTrackById).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123');
      const response = await GET(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PATCH /api/tracks/[id]', () => {
    it('should update a track successfully', async () => {
      const updatedTrack = { ...mockTrack, title: 'Updated Track' };
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: updatedTrack as never,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Track' }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(updatedTrack);
      expect(TrackService.updateTrack).toHaveBeenCalledWith('track-123', {
        title: 'Updated Track',
      });
    });

    it('should return 400 when validation fails', async () => {
      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({
          title: 'x'.repeat(201),
        }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(TrackService.updateTrack).not.toHaveBeenCalled();
    });

    it('should return 404 when track not found', async () => {
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Track not found',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/non-existent', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Track' }),
      });
      const response = await PATCH(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Track not found' });
    });

    it('should return 409 when title already exists', async () => {
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Track with this title already exists',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Existing Track' }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'Track with this title already exists' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Track' }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: false,
        error: 'Failed to update track',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Track' }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update track' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(TrackService.updateTrack).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Track' }),
      });
      const response = await PATCH(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('should handle partial updates with single field', async () => {
      vi.mocked(TrackService.updateTrack).mockResolvedValue({
        success: true,
        data: { ...mockTrack, duration: 300 } as never,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'PATCH',
        body: JSON.stringify({ duration: 300 }),
      });
      const response = await PATCH(request, createParams('track-123'));

      expect(response.status).toBe(200);
      expect(TrackService.updateTrack).toHaveBeenCalledWith('track-123', {
        duration: 300,
      });
    });
  });

  describe('DELETE /api/tracks/[id]', () => {
    it('should delete a track successfully', async () => {
      vi.mocked(TrackService.deleteTrack).mockResolvedValue({
        success: true,
        data: mockTrack as never,
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Track deleted successfully' });
      expect(TrackService.deleteTrack).toHaveBeenCalledWith('track-123');
    });

    it('should return 404 when track not found', async () => {
      vi.mocked(TrackService.deleteTrack).mockResolvedValue({
        success: false,
        error: 'Track not found',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/non-existent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('non-existent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Track not found' });
    });

    it('should return 503 when database is unavailable', async () => {
      vi.mocked(TrackService.deleteTrack).mockResolvedValue({
        success: false,
        error: 'Database unavailable',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data).toEqual({ error: 'Database unavailable' });
    });

    it('should return 500 for other service errors', async () => {
      vi.mocked(TrackService.deleteTrack).mockResolvedValue({
        success: false,
        error: 'Failed to delete track',
      });

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to delete track' });
    });

    it('should return 500 when an exception is thrown', async () => {
      vi.mocked(TrackService.deleteTrack).mockRejectedValue(Error('Unexpected error'));

      const request = new NextRequest('http://localhost:3000/api/tracks/track-123', {
        method: 'DELETE',
      });
      const response = await DELETE(request, createParams('track-123'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Internal server error' });
    });
  });
});
