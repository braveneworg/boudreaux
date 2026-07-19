/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';

import { useVideoEnrichmentStatusQuery } from './use-video-enrichment-status-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  refetchInterval: (query: { state: { data?: { status?: string | null } } }) => number | false;
}

/** A minimal wire payload that satisfies videoEnrichmentStatusResponseSchema. */
const succeededPayload = {
  status: 'succeeded',
  error: null,
  progress: null,
  enrichedAt: '2026-07-11T00:00:00.000Z',
  currentReleasedOn: '2026-02-01',
  artists: [
    {
      artistId: 'a1',
      displayName: 'Lead Artist',
      role: 'PRIMARY',
      current: {
        firstName: 'Lead',
        middleName: null,
        surname: 'Artist',
        akaNames: null,
        displayName: 'Lead Artist',
        bornOn: null,
      },
    },
  ],
  suggestions: [
    {
      id: 's1',
      artistId: 'a1',
      field: 'bornOn',
      value: '1985-03-15',
      confidence: 'high',
      sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
      note: null,
      status: 'pending',
    },
  ],
};

describe('useVideoEnrichmentStatusQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: undefined,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the shared videos.enrichment query-key factory', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.queryKey).toEqual(queryKeys.videos.enrichment('video-1'));
  });

  it('enables the query by default for a non-empty video id', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(true);
  });

  it('disables the query when the video id is empty', () => {
    renderHook(() => useVideoEnrichmentStatusQuery(''));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('keeps the query disabled when the caller passes enabled false', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1', { enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('marks status data stale immediately so enabling the query always refetches', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(0);
  });

  it('lets a caller override the staleTime default', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1', { staleTime: 10_000 }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(10_000);
  });

  it('defaults the returned error when the query has none', () => {
    const { result } = renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    expect(result.current.error).toEqual(Error('Unknown error'));
  });

  it('fetches and parses the status on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => succeededPayload })
    );

    renderHook(() => useVideoEnrichmentStatusQuery('video 1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual(succeededPayload);
    expect(global.fetch).toHaveBeenCalledWith('/api/videos/video%201/enrichment', { signal });
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).rejects.toThrow(
      'Failed to fetch video enrichment status'
    );
  });

  it('polls on the configured interval while the job is pending', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'pending' } } })).toBe(2500);
  });

  it('polls on the configured interval while the job is processing', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'processing' } } })).toBe(2500);
  });

  it('stops polling once the job has succeeded', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'succeeded' } } })).toBe(false);
  });

  it('stops polling once the job has failed', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: 'failed' } } })).toBe(false);
  });

  it('does not poll when the video has never been enriched (status null)', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: { data: { status: null } } })).toBe(false);
  });

  it('does not poll before any status data is fetched', () => {
    renderHook(() => useVideoEnrichmentStatusQuery('video-1'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.refetchInterval({ state: {} })).toBe(false);
  });
});
