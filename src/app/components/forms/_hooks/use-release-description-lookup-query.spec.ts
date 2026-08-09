// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import { useReleaseDescriptionLookupQuery } from './use-release-description-lookup-query';

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
  description: 'A blurb about the record and its reception.',
  confidence: 'medium',
  sources: ['https://example.com/review'],
};

describe('useReleaseDescriptionLookupQuery', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch until refetch is called', async () => {
    const { wrapper } = buildHarness();
    renderHook(() => useReleaseDescriptionLookupQuery('Album', 'Band'), { wrapper });
    expect(mockFetchAndParse).not.toHaveBeenCalled();
  });

  it('fetches and returns the parsed result on refetch', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: LOOKUP_RESULT });

    const { result } = renderHook(() => useReleaseDescriptionLookupQuery('Album', 'Band'), {
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

    const { result } = renderHook(() => useReleaseDescriptionLookupQuery('Album', 'Band'), {
      wrapper,
    });

    await act(async () => {
      await result.current.refetch();
    });

    const [url] = mockFetchAndParse.mock.calls[0] as [string, unknown, unknown];
    expect(url).toContain('/api/releases/description-lookup?');
    expect(url).toContain('title=Album');
    expect(url).toContain('artist=Band');
  });

  it('includes the optional release context only when supplied', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result, rerender } = renderHook(
      (context: OptionalContext) => useReleaseDescriptionLookupQuery('Album', 'Band', context),
      { wrapper, initialProps: {} as OptionalContext }
    );

    await act(async () => {
      await result.current.refetch();
    });
    const first = (mockFetchAndParse.mock.calls[0] as [string])[0];
    expect(first).not.toContain('releasedOn=');
    expect(first).not.toContain('catalogNumber=');
    expect(first).not.toContain('formats=');

    rerender({
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH', 'DIGITAL'],
    });
    await act(async () => {
      await result.current.refetch();
    });
    const second = (mockFetchAndParse.mock.calls[1] as [string])[0];
    expect(second).toContain('releasedOn=2015-03-03');
    expect(second).toContain('catalogNumber=FF4-042');
    expect(second).toContain('formats=VINYL_12_INCH%2CDIGITAL');
  });

  it('omits an empty formats array from the query string', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(
      () => useReleaseDescriptionLookupQuery('Album', 'Band', { formats: [] }),
      { wrapper }
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect((mockFetchAndParse.mock.calls[0] as [string])[0]).not.toContain('formats=');
  });

  it('sends the label notes so the blurb is grounded in them', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(
      () =>
        useReleaseDescriptionLookupQuery('Album', 'Band', {
          labelNotes: 'Cut live to tape.\nSleeve screened by hand.',
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.refetch();
    });

    const [url] = mockFetchAndParse.mock.calls[0] as [string];
    // URLSearchParams encodes spaces as "+", so normalise before matching.
    const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
    expect(decoded).toContain('labelNotes=Cut live to tape.');
    expect(decoded).toContain('Sleeve screened by hand.');
  });

  it('omits blank label notes from the query string', async () => {
    const { wrapper } = buildHarness();
    mockFetchAndParse.mockResolvedValue({ result: null });

    const { result } = renderHook(
      () => useReleaseDescriptionLookupQuery('Album', 'Band', { labelNotes: '   \n ' }),
      { wrapper }
    );

    await act(async () => {
      await result.current.refetch();
    });

    expect((mockFetchAndParse.mock.calls[0] as [string])[0]).not.toContain('labelNotes=');
  });
});

interface OptionalContext {
  releasedOn?: string;
  catalogNumber?: string;
  formats?: string[];
}
