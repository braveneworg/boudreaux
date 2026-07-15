// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import { useReleaseDateLookupQuery } from './use-release-date-lookup-query';

const mockFetchAndParse = vi.hoisted(() => vi.fn());

vi.mock('./fetch-and-parse', () => ({
  fetchAndParse: mockFetchAndParse,
}));

const buildHarness = (): {
  wrapper: ({ children }: { children: ReactNode }) => React.ReactElement;
} => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { wrapper };
};

describe('useReleaseDateLookupQuery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch until refetch is called', async () => {
    const { wrapper } = buildHarness();
    renderHook(() => useReleaseDateLookupQuery('Song', 'Band'), { wrapper });
    expect(mockFetchAndParse).not.toHaveBeenCalled();
  });

  it('fetches and returns the parsed result on refetch', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({
      result: { releasedOn: '2020-06-01', confidence: 'medium', sources: [] },
    });

    const { result } = renderHook(() => useReleaseDateLookupQuery('Song', 'Band'), { wrapper });

    await act(async () => {
      const refetchResult = await result.current.refetch();
      expect(refetchResult.data).toEqual({
        releasedOn: '2020-06-01',
        confidence: 'medium',
        sources: [],
      });
    });
  });

  it('includes the artist query param when an artist is supplied', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(() => useReleaseDateLookupQuery('Song', 'Band'), { wrapper });

    await act(async () => {
      await result.current.refetch();
    });

    const [url] = mockFetchAndParse.mock.calls[0] as [string, unknown, unknown];
    expect(url).toContain('artist=Band');
  });

  it('omits the artist query param when the artist is empty', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(() => useReleaseDateLookupQuery('Song', ''), { wrapper });

    await act(async () => {
      await result.current.refetch();
    });

    const [url] = mockFetchAndParse.mock.calls[0] as [string, unknown, unknown];
    expect(url).not.toContain('artist=');
  });
});
