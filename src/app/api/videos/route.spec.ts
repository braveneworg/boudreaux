// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { auth } from '@/auth';
import { VideoService } from '@/lib/services/video-service';
import { signStreamUrl } from '@/lib/utils/sign-stream-url';

import { GET } from './route';

// Mock server-only to allow importing the route + decorators in tests.
vi.mock('server-only', () => ({}));

// Exercise the REAL withRateLimit + withAuth decorators; only stub `auth()` and
// the rate limiter so the composed handler runs end-to-end.
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  publicLimiter: { check: vi.fn().mockResolvedValue(undefined) },
  PUBLIC_LIMIT: 30,
}));

vi.mock('@/lib/services/video-service', () => ({
  VideoService: {
    getVideos: vi.fn(),
    getPublishedVideos: vi.fn(),
  },
}));

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: vi.fn().mockReturnValue(null),
}));

const mockVideo = {
  id: '507f1f77bcf86cd799439011',
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
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// The collection route is `withRateLimit(...)(withAuth(...))`, whose type
// requires a route context second argument; the handler ignores its params.
const emptyContext = { params: Promise.resolve({}) };

const call = (query = ''): ReturnType<typeof GET> =>
  GET(new NextRequest(`http://localhost:3000/api/videos${query}`), emptyContext);

describe('GET /api/videos', () => {
  it('returns 401 when the request is unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const response = await call();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
  });

  it('returns 403 for a signed-in non-admin on the admin listing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1', role: 'user' } } as never);

    const response = await call();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'Insufficient permissions' });
  });

  it('does not call getVideos for a non-admin admin listing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1', role: 'user' } } as never);

    await call();

    expect(VideoService.getVideos).not.toHaveBeenCalled();
  });

  it('returns 200 for a signed-in non-admin on the published listing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: 'user-1', role: 'user' } } as never);
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');

    expect(response.status).toBe(200);
  });

  it('calls getPublishedVideos with default skip 0 / take 5 and desc sort', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [] as never,
    });

    await call('?listing=published');

    expect(VideoService.getPublishedVideos).toHaveBeenCalledWith({
      sort: 'desc',
      skip: 0,
      take: 5,
    });
  });

  it('clamps take=500 to 50 on the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?take=500');

    expect(VideoService.getVideos).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('falls back to default skip/take for non-numeric pagination params', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?skip=nope&take=nope');

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 5 })
    );
  });

  it('forwards the sort param to the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?sort=asc');

    expect(VideoService.getVideos).toHaveBeenCalledWith(expect.objectContaining({ sort: 'asc' }));
  });

  it('forwards the search param to the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?search=blues');

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'blues' })
    );
  });

  it('forwards published=true to the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?published=true');

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ published: true })
    );
  });

  it('forwards published=false to the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?published=false');

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ published: false })
    );
  });

  it('forwards archived=true to the admin listing', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?archived=true');

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true })
    );
  });

  it('defaults published to null when the param is absent', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call();

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ published: null })
    );
  });

  it('defaults archived to false when the param is absent', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call();

    expect(VideoService.getVideos).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false })
    );
  });

  it('defaults sort to desc when the param is invalid', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({ success: true, data: [] as never });

    await call('?sort=sideways');

    expect(VideoService.getVideos).toHaveBeenCalledWith(expect.objectContaining({ sort: 'desc' }));
  });

  it('attaches the signed stream URL to each row when signing succeeds', async () => {
    vi.mocked(signStreamUrl).mockReturnValueOnce('https://cdn.example.com/video.mp4');
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0].streamUrl).toBe('https://cdn.example.com/video.mp4');
  });

  it('attaches a null stream URL when signing is unconfigured', async () => {
    vi.mocked(signStreamUrl).mockReturnValueOnce(null);
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0].streamUrl).toBeNull();
  });

  it('omits createdBy from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('createdBy');
  });

  it('omits updatedBy from serialized rows', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0]).not.toHaveProperty('updatedBy');
  });

  it('serializes a BigInt fileSize to a JSON-safe number', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');
    const data = await response.json();

    expect(data.rows[0].fileSize).toBe(123456);
  });

  it('returns nextSkip null when a short page comes back', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published&take=5');
    const data = await response.json();

    expect(data.nextSkip).toBeNull();
  });

  it('returns the next offset when a full page comes back', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published&take=1');
    const data = await response.json();

    expect(data.nextSkip).toBe(1);
  });

  it('maps a database-unavailable failure to 503', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const response = await call('?listing=published');

    expect(response.status).toBe(503);
  });

  it('maps a generic service failure to 500', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: false,
      error: 'Failed to retrieve videos',
    });

    const response = await call('?listing=published');

    expect(response.status).toBe(500);
  });

  it('maps an admin-listing database-unavailable failure to 503', async () => {
    vi.mocked(VideoService.getVideos).mockResolvedValue({
      success: false,
      error: 'Database unavailable',
    });

    const response = await call();

    expect(response.status).toBe(503);
  });

  it('maps a thrown error to 500', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockRejectedValue(new Error('boom'));

    const response = await call('?listing=published');
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
  });

  it('sets a private, no-store Cache-Control header on success', async () => {
    vi.mocked(VideoService.getPublishedVideos).mockResolvedValue({
      success: true,
      data: [mockVideo] as never,
    });

    const response = await call('?listing=published');

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
