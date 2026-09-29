/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';

import { useAdminTourQuery, useTourQuery } from './use-tour-query';

interface QueryOptions {
  queryKey: unknown[];
  queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  enabled: boolean;
}

const mockUseQuery = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const signal = new AbortController().signal;
const fetchMock = vi.fn();

const lastOptions = (): QueryOptions => mockUseQuery.mock.calls.at(-1)?.[0] as QueryOptions;

describe('tour queries', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ isPending: false, data: null, refetch: vi.fn() });
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    mockUseQuery.mockReset();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  describe('useTourQuery', () => {
    it('reads the tour as the public may see it', async () => {
      renderHook(() => useTourQuery('tour-1'));

      await lastOptions().queryFn({ signal });

      expect(fetchMock.mock.calls).toEqual([['/api/tours/tour-1', { signal }]]);
    });

    it('is keyed as the public tour', () => {
      renderHook(() => useTourQuery('tour-1'));

      expect(lastOptions().queryKey).toEqual(['tours', 'detail', 'tour-1']);
    });
  });

  describe('useAdminTourQuery (ADR-0015)', () => {
    it('reads the unfiltered tour', async () => {
      renderHook(() => useAdminTourQuery('tour-1'));

      await lastOptions().queryFn({ signal });

      expect(fetchMock.mock.calls).toEqual([['/api/tours/tour-1?scope=admin', { signal }]]);
    });

    it('is keyed apart from the public tour, so neither is served for the other', () => {
      renderHook(() => useAdminTourQuery('tour-1'));

      expect(lastOptions().queryKey).toEqual(['tours', 'adminDetail', 'tour-1']);
    });

    it('stays idle without a tour id', () => {
      renderHook(() => useAdminTourQuery(''));

      expect(lastOptions().enabled).toBe(false);
    });

    it('resolves to null when the tour does not exist', async () => {
      renderHook(() => useAdminTourQuery('tour-1'));

      await expect(lastOptions().queryFn({ signal })).resolves.toBeNull();
    });
  });
});
