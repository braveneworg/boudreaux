/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';

import { fetchAndParse } from '@/utils/fetch-and-parse';

import { useHidingWarning } from './use-hiding-warning';

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

const signal = new AbortController().signal;
const nothing = { releases: [], tourDates: [] };
const work = { releases: [{ id: 'r', title: 'Album', leavesNoByline: false }], tourDates: [] };

describe('useHidingWarning', () => {
  beforeEach(() => {
    mockFetchQuery.mockImplementation(({ queryFn }: FetchQueryOptions) => queryFn({ signal }));
  });

  afterEach(() => {
    mockFetchQuery.mockReset();
    vi.mocked(fetchAndParse).mockReset();
  });

  it("loads the public work that carries the artist's name", async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(nothing);
    const { result } = renderHook(() => useHidingWarning());

    await act(() => result.current.confirmHiding('artist-1'));

    expect(vi.mocked(fetchAndParse).mock.calls[0][0]).toBe('/api/artists/artist-1/published-work');
  });

  it('always reads fresh, under the artist key', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(nothing);
    const { result } = renderHook(() => useHidingWarning());

    await act(() => result.current.confirmHiding('artist-1'));

    const { queryKey, staleTime } = mockFetchQuery.mock.calls[0][0] as FetchQueryOptions;
    expect({ queryKey, staleTime }).toEqual({
      queryKey: ['artists', 'publishedWork', 'artist-1'],
      staleTime: 0,
    });
  });

  it('goes ahead without asking when no public work carries the name', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(nothing);
    const { result } = renderHook(() => useHidingWarning());

    const proceed = await act(() => result.current.confirmHiding('artist-1'));

    expect({ proceed, asking: result.current.work }).toEqual({ proceed: true, asking: null });
  });

  it('asks when public work will lose the name', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(work);
    const { result } = renderHook(() => useHidingWarning());

    act(() => {
      void result.current.confirmHiding('artist-1');
    });

    await waitFor(() => expect(result.current.work).toEqual(work));
  });

  it('goes ahead once the admin confirms', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(work);
    const { result } = renderHook(() => useHidingWarning());
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.confirmHiding('artist-1');
    });
    await waitFor(() => expect(result.current.work).not.toBeNull());

    act(() => result.current.confirm());

    await expect(pending).resolves.toBe(true);
  });

  it('stops when the admin cancels', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(work);
    const { result } = renderHook(() => useHidingWarning());
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = result.current.confirmHiding('artist-1');
    });
    await waitFor(() => expect(result.current.work).not.toBeNull());

    act(() => result.current.cancel());

    await expect(pending).resolves.toBe(false);
  });

  it('closes once the admin has answered', async () => {
    vi.mocked(fetchAndParse).mockResolvedValueOnce(work);
    const { result } = renderHook(() => useHidingWarning());
    act(() => {
      void result.current.confirmHiding('artist-1');
    });
    await waitFor(() => expect(result.current.work).not.toBeNull());

    act(() => result.current.confirm());

    expect(result.current.work).toBeNull();
  });

  it('never blocks hiding: goes ahead when the work cannot be loaded', async () => {
    vi.mocked(fetchAndParse).mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useHidingWarning());

    const proceed = await act(() => result.current.confirmHiding('artist-1'));

    expect(proceed).toBe(true);
  });
});
