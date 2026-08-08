// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import { useVideoDescriptionLookupQuery } from './use-video-description-lookup-query';

const mockFetchAndParse = vi.hoisted(() => vi.fn());

vi.mock('@/utils/fetch-and-parse', () => ({
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

const LOOKUP_RESULT = {
  description: 'Prose naming the artist with an attributed quote.',
  confidence: 'medium',
  sources: ['https://example.com/review'],
};

describe('useVideoDescriptionLookupQuery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch until refetch is called', async () => {
    const { wrapper } = buildHarness();
    renderHook(() => useVideoDescriptionLookupQuery('Song', 'Band'), { wrapper });
    expect(mockFetchAndParse).not.toHaveBeenCalled();
  });

  it('fetches and returns the parsed result on refetch', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: LOOKUP_RESULT });

    const { result } = renderHook(() => useVideoDescriptionLookupQuery('Song', 'Band'), {
      wrapper,
    });

    await act(async () => {
      const refetchResult = await result.current.refetch();
      expect(refetchResult.data).toEqual(LOOKUP_RESULT);
    });
  });

  it('sends title and artist as query params', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(() => useVideoDescriptionLookupQuery('Song', 'Band'), {
      wrapper,
    });

    await act(async () => {
      await result.current.refetch();
    });

    const [url] = mockFetchAndParse.mock.calls[0] as [string, unknown, unknown];
    expect(url).toContain('/api/videos/description-lookup?');
    expect(url).toContain('title=Song');
    expect(url).toContain('artist=Band');
  });

  it('includes the releasedOn param only when supplied', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result, rerender } = renderHook(
      ({ releasedOn }: { releasedOn?: string }) =>
        useVideoDescriptionLookupQuery('Song', 'Band', releasedOn),
      { wrapper, initialProps: {} }
    );

    await act(async () => {
      await result.current.refetch();
    });
    expect((mockFetchAndParse.mock.calls[0] as [string])[0]).not.toContain('releasedOn=');

    rerender({ releasedOn: '2021-04-09' });
    await act(async () => {
      await result.current.refetch();
    });
    expect((mockFetchAndParse.mock.calls[1] as [string])[0]).toContain('releasedOn=2021-04-09');
  });
});
