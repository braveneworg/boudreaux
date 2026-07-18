/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useState } from 'react';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Filter state shared by the release/artist/featured-artist data views. */
export interface EntityFilters {
  search: string;
  showPublished: boolean;
  showUnpublished: boolean;
  showDeleted: boolean;
}

/** Filter state for the videos data view (archive lifecycle + sort). */
export interface VideoFilters {
  search: string;
  showPublished: boolean;
  showUnpublished: boolean;
  showArchived: boolean;
  sort: 'asc' | 'desc';
}

interface DataViewFilterSlices {
  releases: EntityFilters;
  artists: EntityFilters;
  featuredArtists: EntityFilters;
  videos: VideoFilters;
}

export type DataViewEntityKey = keyof DataViewFilterSlices;

interface DataViewFiltersState extends DataViewFilterSlices {
  setFilters: <K extends DataViewEntityKey>(
    entity: K,
    patch: Partial<DataViewFilterSlices[K]>
  ) => void;
  resetFilters: (entity: DataViewEntityKey) => void;
}

const DEFAULT_ENTITY_FILTERS: EntityFilters = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showDeleted: false,
};

const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  search: '',
  showPublished: true,
  showUnpublished: true,
  showArchived: false,
  sort: 'desc',
};

const DEFAULT_SLICES: DataViewFilterSlices = {
  releases: DEFAULT_ENTITY_FILTERS,
  artists: DEFAULT_ENTITY_FILTERS,
  featuredArtists: DEFAULT_ENTITY_FILTERS,
  videos: DEFAULT_VIDEO_FILTERS,
};

/**
 * Admin data-view filters, persisted to sessionStorage so search/toggles/sort
 * survive edit-and-back navigation and tab reloads but reset when the tab
 * closes. Holds only client-owned UI state — the filtered DATA stays in
 * TanStack Query. `skipHydration` avoids an SSR hydration mismatch; views
 * gate their queries on {@link useDataViewFiltersHydration} instead.
 */
export const useDataViewFilters = create<DataViewFiltersState>()(
  persist(
    (set) => ({
      ...DEFAULT_SLICES,
      setFilters: (entity, patch) =>
        set(
          (state) => ({ [entity]: { ...state[entity], ...patch } }) as Partial<DataViewFiltersState>
        ),
      resetFilters: (entity) =>
        set({ [entity]: DEFAULT_SLICES[entity] } as Partial<DataViewFiltersState>),
    }),
    {
      name: 'boudreaux-admin-filters',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        releases: state.releases,
        artists: state.artists,
        featuredArtists: state.featuredArtists,
        videos: state.videos,
      }),
      skipHydration: true,
    }
  )
);

/**
 * Rehydrates the filter store from sessionStorage after mount and reports
 * completion. Views pass the returned flag as the query's `enabled` option:
 * the first client render matches SSR (defaults, no storage read), and the
 * first fetch waits for persisted filters instead of firing twice.
 *
 * @returns `true` once persisted filters (if any) have been applied.
 */
export const useDataViewFiltersHydration = (): boolean => {
  const [hydrated, setHydrated] = useState(useDataViewFilters.persist?.hasHydrated() ?? false);

  useEffect(() => {
    const unsubscribe = useDataViewFilters.persist.onFinishHydration(() => setHydrated(true));
    void useDataViewFilters.persist.rehydrate();
    return unsubscribe;
  }, []);

  return hydrated;
};
