/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { useVideoProbePrefillQuery } from './use-video-probe-prefill-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const okResponse = {
  ok: true,
  tags: {
    title: 'My Video',
    artist: 'Test Artist',
    releasedOn: '2024-01-01',
    description: 'A description',
    durationSeconds: 120,
  },
};

const failResponse = { ok: false };

interface CapturedOptions {
  enabled: boolean;
  staleTime: number;
  retry: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

beforeEach(() => {
  mockUseQuery.mockReturnValue({
    isPending: false,
    isError: false,
    error: undefined,
    data: undefined,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockUseQuery.mockReset();
});

describe('useVideoProbePrefillQuery', () => {
  it('fetches the correct URL with both params encoded and resolves parsed ok:true response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okResponse })
    );

    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    const { signal } = new AbortController();
    const result = await lastOptions().queryFn({ signal });

    expect(result).toEqual(okResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/videos/probe-metadata?videoId=${encodeURIComponent('video-1')}&s3Key=${encodeURIComponent('videos/clip.mp4')}`,
      { signal }
    );
  });

  it('forwards the AbortSignal to fetch', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okResponse })
    );

    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    await lastOptions().queryFn({ signal: controller.signal });

    expect(global.fetch).toHaveBeenCalledWith(expect.any(String), {
      signal: controller.signal,
    });
  });

  it('disables the query when s3Key is empty', () => {
    renderHook(() => useVideoProbePrefillQuery('', 'video-1'));

    expect(lastOptions().enabled).toBe(false);
  });

  it('disables the query when videoId is empty', () => {
    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', ''));

    expect(lastOptions().enabled).toBe(false);
  });

  it('respects options.enabled: false override', () => {
    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });

  it('throws on a Zod validation failure and uses retry: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ bad: 'shape' }) })
    );

    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    const { signal } = new AbortController();
    await expect(lastOptions().queryFn({ signal })).rejects.toThrow();

    expect(lastOptions().retry).toBe(false);
  });

  it('resolves ok:false response as data (not an error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => failResponse })
    );

    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    const { signal } = new AbortController();
    const result = await lastOptions().queryFn({ signal });

    expect(result).toEqual({ ok: false });
  });

  it('uses the probePrefill query key', () => {
    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    expect(lastOptions().queryKey).toEqual([
      'videos',
      'probePrefill',
      'videos/clip.mp4',
      'video-1',
    ]);
  });

  it('sets staleTime to Infinity', () => {
    renderHook(() => useVideoProbePrefillQuery('videos/clip.mp4', 'video-1'));

    expect(lastOptions().staleTime).toBe(Infinity);
  });
});
