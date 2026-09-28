/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';

import { fetchAndParse } from '@/utils/fetch-and-parse';

import { useCreditConfirmationLoader } from './use-credit-confirmation-loader';

interface FetchQueryOptions {
  queryKey: unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  staleTime: number;
}

const mockFetchQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: mockFetchQuery }),
}));

vi.mock('@/utils/fetch-and-parse', () => ({ fetchAndParse: vi.fn() }));

const confirmation = { awaiting: [], stayHidden: [] };
const signal = new AbortController().signal;

describe('useCreditConfirmationLoader', () => {
  beforeEach(() => {
    mockFetchQuery.mockImplementation(({ queryFn }: FetchQueryOptions) => queryFn({ signal }));
    vi.mocked(fetchAndParse).mockResolvedValue(confirmation);
  });

  afterEach(() => {
    mockFetchQuery.mockReset();
    vi.mocked(fetchAndParse).mockReset();
  });

  it("loads a release's stored credits", async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await result.current({ releaseId: 'release-1' });

    expect(vi.mocked(fetchAndParse).mock.calls[0][0]).toBe('/api/releases/release-1/credits');
  });

  it('loads the credits of the artists a form is about to credit', async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await result.current({ artistIds: ['a', 'b'] });

    expect(vi.mocked(fetchAndParse).mock.calls[0][0]).toBe('/api/artists/credits?id=a&id=b');
  });

  it('returns what the route answered', async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await expect(result.current({ releaseId: 'release-1' })).resolves.toEqual(confirmation);
  });

  it('never serves a cached answer: artists may have been published since', async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await result.current({ releaseId: 'release-1' });

    expect((mockFetchQuery.mock.calls[0][0] as FetchQueryOptions).staleTime).toBe(0);
  });

  it('keys the two sources apart', async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await result.current({ releaseId: 'release-1' });
    await result.current({ artistIds: ['b', 'a'] });

    expect(mockFetchQuery.mock.calls.map(([{ queryKey }]) => queryKey)).toEqual([
      ['releases', 'credits', 'release-1'],
      ['artists', 'credits', 'a,b'],
    ]);
  });

  it('forwards the abort signal to the request', async () => {
    const { result } = renderHook(() => useCreditConfirmationLoader());

    await result.current({ releaseId: 'release-1' });

    expect(vi.mocked(fetchAndParse).mock.calls[0][2]).toMatchObject({ signal });
  });
});
