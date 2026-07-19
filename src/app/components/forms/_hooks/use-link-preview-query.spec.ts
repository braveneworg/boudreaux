/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

import { useLinkPreviewQuery } from './use-link-preview-query';

const mockUseQuery = vi.hoisted(() => vi.fn());
const mockFetchAndParse = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock('@/utils/fetch-and-parse', () => ({
  fetchAndParse: (...args: unknown[]) => mockFetchAndParse(...args),
}));

interface QueryOptionsShape {
  queryKey: unknown[];
  staleTime: number;
  enabled?: boolean;
  queryFn: (ctx: { signal: AbortSignal }) => Promise<LinkPreview>;
}

const PREVIEW: LinkPreview = {
  url: 'https://example.com',
  resolved: true,
  title: 'Example',
  description: 'An example page',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: null,
};

describe('useLinkPreviewQuery', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ isPending: false, isError: false, data: PREVIEW });
    mockFetchAndParse.mockResolvedValue(PREVIEW);
  });

  it('keys the query by the requested url', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.queryKey).toEqual(['linkPreview', 'https://example.com']);
  });

  it('caches previews for one hour by default', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(3_600_000);
  });

  it('leaves the query disabled until the caller enables it', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com', { enabled: false }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.enabled).toBe(false);
  });

  it('lets a caller override the staleTime default', () => {
    renderHook(() => useLinkPreviewQuery('https://example.com', { staleTime: 0 }));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;

    expect(options.staleTime).toBe(0);
  });

  it('fetches the encoded url through fetchAndParse forwarding the signal', async () => {
    renderHook(() => useLinkPreviewQuery('https://example.com/a b'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();
    await options.queryFn({ signal });

    expect(mockFetchAndParse).toHaveBeenCalledWith(
      '/api/link-preview?url=https%3A%2F%2Fexample.com%2Fa%20b',
      expect.anything(),
      { signal, errorMessage: 'Failed to fetch link preview' }
    );
  });

  it('resolves the queryFn to the parsed preview', async () => {
    renderHook(() => useLinkPreviewQuery('https://example.com'));

    const options = mockUseQuery.mock.calls[0]?.[0] as QueryOptionsShape;
    const { signal } = new AbortController();

    await expect(options.queryFn({ signal })).resolves.toEqual(PREVIEW);
  });

  it('returns the useQuery result verbatim', () => {
    const { result } = renderHook(() => useLinkPreviewQuery('https://example.com'));

    expect(result.current.data).toEqual(PREVIEW);
  });
});
