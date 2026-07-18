/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useDataViewFilters } from './use-data-view-filters';

const STORAGE_KEY = 'boudreaux-admin-filters';

const DEFAULT_ENTITY = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showDeleted: false,
};

describe('useDataViewFilters', () => {
  it('exposes default filters for every slice', () => {
    const state = useDataViewFilters.getState();
    expect(state.releases).toEqual(DEFAULT_ENTITY);
    expect(state.artists).toEqual(DEFAULT_ENTITY);
    expect(state.featuredArtists).toEqual(DEFAULT_ENTITY);
    expect(state.videos).toEqual({
      search: '',
      showPublished: true,
      showUnpublished: true,
      showArchived: false,
      sort: 'desc',
    });
  });

  it('patches a single slice without touching the others', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'alpha', showDeleted: true });

    const state = useDataViewFilters.getState();
    expect(state.releases).toEqual({ ...DEFAULT_ENTITY, search: 'alpha', showDeleted: true });
    expect(state.artists).toEqual(DEFAULT_ENTITY);
    expect(state.videos.sort).toBe('desc');
  });

  it('patches the videos slice including sort', () => {
    useDataViewFilters.getState().setFilters('videos', { sort: 'asc', showArchived: true });

    expect(useDataViewFilters.getState().videos.sort).toBe('asc');
    expect(useDataViewFilters.getState().videos.showArchived).toBe(true);
  });

  it('resets one slice to defaults, leaving other slices alone', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'alpha' });
    useDataViewFilters.getState().setFilters('artists', { search: 'beta' });

    useDataViewFilters.getState().resetFilters('releases');

    expect(useDataViewFilters.getState().releases).toEqual(DEFAULT_ENTITY);
    expect(useDataViewFilters.getState().artists.search).toBe('beta');
  });

  it('persists slices (and only slices) to sessionStorage on change', () => {
    useDataViewFilters.getState().setFilters('releases', { search: 'persisted' });

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw ?? '{}') as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(envelope.version).toBe(1);
    expect(envelope.state.releases).toEqual({ ...DEFAULT_ENTITY, search: 'persisted' });
    // partialize: actions never reach storage
    expect(envelope.state).not.toHaveProperty('setFilters');
    expect(envelope.state).not.toHaveProperty('resetFilters');
  });

  it('skips hydration until rehydrate() is called, then applies stored values', async () => {
    // skipHydration means creating/using the store never reads storage on its own.
    expect(useDataViewFilters.persist.hasHydrated()).toBe(false);

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          releases: {
            search: 'from-storage',
            showPublished: false,
            showUnpublished: true,
            showDeleted: true,
          },
        },
        version: 1,
      })
    );

    await useDataViewFilters.persist.rehydrate();

    expect(useDataViewFilters.persist.hasHydrated()).toBe(true);
    expect(useDataViewFilters.getState().releases.search).toBe('from-storage');
    expect(useDataViewFilters.getState().releases.showDeleted).toBe(true);
    // Slices absent from storage keep their defaults (shallow merge).
    expect(useDataViewFilters.getState().videos.sort).toBe('desc');
  });
});
