// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { VideoService } from '@/lib/services/video-service';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

import { GET } from './route';

// Mock server-only to allow importing the route + decorators in tests.
vi.mock('server-only', () => ({}));

// Exercise the REAL withAdmin decorator; only stub `auth()` (as an admin).
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('@/lib/services/video-service', () => ({
  VideoService: { getVideoById: vi.fn() },
}));

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: vi.fn().mockReturnValue(null),
}));

const VALID_ID = '507f1f77bcf86cd799439011';

const mockVideo = {
  id: VALID_ID,
  title: 'Test Video',
  artist: 'Test Artist',
  category: 'MUSIC',
  description: null,
  releasedOn: new Date('2024-01-01'),
  durationSeconds: 120,
  s3Key: 'videos/test/video.mp4',
  fileName: 'video.mp4',
  fileSize: BigInt(123456),
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: new Date('2024-02-01'),
  archivedAt: null,
  createdBy: 'admin-1',
  updatedBy: null,
  width: 1920,
  probedAt: new Date('2026-03-01'),
  probeData: { format: { filename: 'media/videos/test/video.mp4' } },
  enrichmentJobToken: 'job-token-1',
  enrichmentProgress: { stage: 'searching' },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const request = (): NextRequest => new NextRequest(`http://localhost:3000/api/videos/${VALID_ID}`);

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/videos/[id]', () => {
  it('returns 400 for an invalid ObjectId', async () => {
    const response = await GET(request(), context('not-an-object-id'));

    expect(response.status).toBe(400);
    expect(VideoService.getVideoById).not.toHaveBeenCalled();
  });

  it('returns 404 when the video is missing', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: false,
      error: 'Video not found',
    });

    const response = await GET(request(), context(VALID_ID));

    expect(response.status).toBe(404);
  });

  it('returns 200 with the signed stream URL attached', async () => {
    vi.mocked(signStreamUrl).mockReturnValueOnce('https://cdn.example.com/video.mp4');
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.streamUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('serializes a BigInt fileSize to a JSON-safe number', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data.fileSize).toBe(123456);
  });

  it('keeps probe display fields on the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data.width).toBe(1920);
  });

  it('omits probeData from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('probeData');
  });

  it('omits enrichmentJobToken from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('enrichmentJobToken');
  });

  it('omits enrichmentProgress from the admin detail payload', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: true,
      data: mockVideo as never,
    });

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(data).not.toHaveProperty('enrichmentProgress');
  });

  it('maps a database-unavailable failure to 503', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const response = await GET(request(), context(VALID_ID));

    expect(response.status).toBe(503);
  });

  it('maps a generic service failure to 500', async () => {
    vi.mocked(VideoService.getVideoById).mockResolvedValue({
      success: false,
      error: 'Failed to retrieve video',
    });

    const response = await GET(request(), context(VALID_ID));

    expect(response.status).toBe(500);
  });

  it('maps a thrown error to 500', async () => {
    vi.mocked(VideoService.getVideoById).mockRejectedValue(new Error('boom'));

    const response = await GET(request(), context(VALID_ID));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });
});
