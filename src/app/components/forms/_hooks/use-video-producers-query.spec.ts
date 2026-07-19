/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from '@/utils/fetch-and-parse';

import { useVideoProducersQuery } from './use-video-producers-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const producersResponse = {
  producers: [
    { id: 'p1', name: 'Rick Rubin' },
    { id: 'p2', name: 'Brian Eno' },
  ],
};

interface CapturedOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('useVideoProducersQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: producersResponse.producers,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('disables the query when videoId is empty', () => {
    renderHook(() => useVideoProducersQuery(''));

    expect(lastOptions().enabled).toBe(false);
  });

  it('enables the query for a non-empty videoId', () => {
    renderHook(() => useVideoProducersQuery('f'.repeat(24)));

    expect(lastOptions().enabled).toBe(true);
  });

  it('uses the correct query key', () => {
    const videoId = 'f'.repeat(24);
    renderHook(() => useVideoProducersQuery(videoId));

    expect(lastOptions().queryKey).toEqual(['videos', 'producers', videoId]);
  });

  it('fetches and returns parsed producers', async () => {
    const videoId = 'f'.repeat(24);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => producersResponse })
    );

    renderHook(() => useVideoProducersQuery(videoId));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(producersResponse.producers);
    expect(global.fetch).toHaveBeenCalledWith(`/api/videos/${videoId}/producers`, { signal });
  });

  it('throws when the request fails', async () => {
    const videoId = 'f'.repeat(24);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useVideoProducersQuery(videoId));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to fetch producers');
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    const videoId = 'f'.repeat(24);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ producers: [{ id: 'p1' }] }),
      })
    );

    renderHook(() => useVideoProducersQuery(videoId));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('lets a caller-supplied enabled=false win over a valid videoId', () => {
    renderHook(() => useVideoProducersQuery('f'.repeat(24), { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
