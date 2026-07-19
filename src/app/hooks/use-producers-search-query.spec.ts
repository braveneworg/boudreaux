/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { keepPreviousData } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { ResponseValidationError } from '@/utils/fetch-and-parse';

import { useProducersSearchQuery } from './use-producers-search-query';

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const producerSearchResponse = {
  results: [{ id: 'p1', name: 'Rick' }],
};

interface CapturedOptions {
  enabled: boolean;
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
  placeholderData: unknown;
}

const lastOptions = (): CapturedOptions => mockUseQuery.mock.calls[0]?.[0] as CapturedOptions;

describe('useProducersSearchQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      isPending: false,
      error: undefined,
      data: producerSearchResponse.results,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('disables the query for a query below the minimum length', () => {
    renderHook(() => useProducersSearchQuery('a'));

    expect(lastOptions().enabled).toBe(false);
  });

  it('disables the query for a whitespace-only query', () => {
    renderHook(() => useProducersSearchQuery('   '));

    expect(lastOptions().enabled).toBe(false);
  });

  it('enables the query and normalizes the key at the minimum length', () => {
    renderHook(() => useProducersSearchQuery('  Rick '));

    expect(lastOptions().enabled).toBe(true);
    expect(lastOptions().queryKey).toEqual(['producers', 'search', 'rick']);
  });

  it('keeps previous data', () => {
    renderHook(() => useProducersSearchQuery('rick'));

    expect(lastOptions().placeholderData).toBe(keepPreviousData);
  });

  it('fetches the encoded producer-search URL with the forwarded signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => producerSearchResponse })
    );

    renderHook(() => useProducersSearchQuery('rick'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).resolves.toEqual(
      producerSearchResponse.results
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/producers/search?q=rick', {
      signal,
    });
  });

  it('throws when the producer search request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    renderHook(() => useProducersSearchQuery('rick'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toThrow('Failed to search producers');
  });

  it('surfaces a ResponseValidationError for a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [{ id: 'p1' }] }),
      })
    );

    renderHook(() => useProducersSearchQuery('rick'));

    const { signal } = new AbortController();

    await expect(lastOptions().queryFn({ signal })).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('lets a caller-supplied enabled=false win over a valid query', () => {
    renderHook(() => useProducersSearchQuery('rick', { enabled: false }));

    expect(lastOptions().enabled).toBe(false);
  });
});
