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
});
