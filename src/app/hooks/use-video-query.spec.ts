/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useVideoQuery } from './use-video-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const videoRowResponse = {
  id: 'video-1',
  title: 'Clip',
  artist: 'Artist',
  category: 'MUSIC',
  description: null,
  releasedOn: '2024-01-01T00:00:00.000Z',
  durationSeconds: 90,
  s3Key: 'videos/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: 123456,
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: '2024-02-01T00:00:00.000Z',
  archivedAt: null,
  createdBy: 'admin-1',
  updatedBy: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  streamUrl: 'https://cdn.example.com/clip.mp4',
};

interface CapturedOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

beforeEach(() => {
  mockUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    error: undefined,
    data: null,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockUseQuery.mockReset();
});

describe('useVideoQuery', () => {
  it('disables the query when no id is provided', () => {
    renderHook(() => useVideoQuery(''));

    expect(lastOptions().enabled).toBe(false);
  });

  it('uses the video detail query key', () => {
    renderHook(() => useVideoQuery('video-1'));

    expect(lastOptions().queryKey).toEqual(['videos', 'detail', 'video-1']);
  });

  it('fetches the by-id URL and parses the video on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => videoRowResponse })
    );

    renderHook(() => useVideoQuery('video-1'));

    const { signal } = new AbortController();
    const result = (await lastOptions().queryFn({ signal })) as { id: string };

    expect(result.id).toBe('video-1');
    expect(global.fetch).toHaveBeenCalledWith('/api/videos/video-1', { signal });
  });

  it('returns null when the video is not found (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    renderHook(() => useVideoQuery('missing'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).resolves.toBeNull();
  });

  it('throws when the response fails for a non-404 reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    renderHook(() => useVideoQuery('video-1'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch video');
  });

  it('respects a caller-supplied enabled override', () => {
    renderHook(() => useVideoQuery('video-1', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
