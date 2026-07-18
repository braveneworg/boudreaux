/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook, waitFor } from '@testing-library/react';

import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

const STORAGE_KEY = 'boudreaux-admin-filters';

describe('useDataViewFiltersHydration', () => {
  it('flips to true once rehydration completes', async () => {
    const { result } = renderHook(() => useDataViewFiltersHydration());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it('applies persisted sessionStorage values during hydration', async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          videos: {
            search: 'stored-video',
            showPublished: true,
            showUnpublished: false,
            showArchived: true,
            sort: 'asc',
          },
        },
        version: 1,
      })
    );

    renderHook(() => useDataViewFiltersHydration());

    await waitFor(() => {
      expect(useDataViewFilters.getState().videos.search).toBe('stored-video');
    });
    expect(useDataViewFilters.getState().videos.sort).toBe('asc');
    // Slices absent from storage keep their defaults.
    expect(useDataViewFilters.getState().releases.search).toBe('');
  });

  it('still hydrates (to defaults) when the stored value is corrupted', async () => {
    // Non-JSON garbage: persist's internal JSON.parse rejects the rehydrate
    // promise chain, so onFinishHydration never fires — the hook must flip
    // on settle instead of waiting forever.
    //
    // Set corrupted storage first so that the rehydrate() call resets
    // hasHydrated to false AND reads the corrupted value in the same sync
    // chain (toThenable is synchronous over jsdom sessionStorage). hasHydrated
    // stays false after the call, so the hook renders with hydrated=false.
    sessionStorage.setItem(STORAGE_KEY, 'not-json{');
    // Explicitly reset hasHydrated — if a prior test already hydrated the
    // store, hasHydrated() returns true and useState() initialises to true,
    // masking the bug. rehydrate() resets it synchronously; with the corrupted
    // value already in storage it then immediately settles with hasHydrated
    // still false (the catch path skips the hasHydrated=true line).
    useDataViewFilters.persist?.rehydrate();

    const { result } = renderHook(() => useDataViewFiltersHydration());

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(useDataViewFilters.getState().releases.search).toBe('');
  });

  it('degrades to hydrated when the persist API is unavailable', async () => {
    const persistApi = useDataViewFilters.persist;
    // Simulate a storage-blocked client: the middleware never attached the
    // persist API. Restore in finally so other tests keep persistence.
    Object.defineProperty(useDataViewFilters, 'persist', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      const { result } = renderHook(() => useDataViewFiltersHydration());
      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    } finally {
      Object.defineProperty(useDataViewFilters, 'persist', {
        configurable: true,
        writable: true,
        value: persistApi,
      });
    }
  });
});
