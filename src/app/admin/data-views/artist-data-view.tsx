/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import {
  useArchiveArtistMutation,
  usePublishArtistMutation,
  useRestoreArtistMutation,
} from '@/app/hooks/mutations/use-artist-mutations';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useInfiniteArtistsQuery } from '@/app/hooks/use-infinite-artists-query';
import { ENTITIES } from '@/lib/constants';
import type { Artist } from '@/lib/types/media-models';

import { DataView } from './data-view';
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

export const ArtistDataView = () => {
  const { publishArtistAsync } = usePublishArtistMutation();
  const { archiveArtistAsync } = useArchiveArtistMutation();
  const { restoreArtistAsync } = useRestoreArtistMutation();
  const fieldsToShow = [
    'firstName',
    'middleName',
    'surname',
    'displayName',
    'slug',
    'createdAt',
    'updatedAt',
    'publishedOn',
  ];

  const { search, showPublished, showUnpublished, showDeleted } = useDataViewFilters(
    (state) => state.artists
  );
  const setFilters = useDataViewFilters((state) => state.setFilters);
  const hydrated = useDataViewFiltersHydration();
  // flushKey: a rehydrated search reaches the query without the debounce lag.
  const debouncedSearch = useDebounce(search, 300, { flushKey: hydrated });

  // Both same → no publish filter; otherwise the enabled one.
  const published = showPublished === showUnpublished ? null : showPublished;

  const {
    data,
    isPending,
    isFetching,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteArtistsQuery(
    { search: debouncedSearch, published, deleted: showDeleted },
    { enabled: hydrated }
  );

  const rows = useMemo(() => data?.pages.flatMap((page) => page.rows) ?? [], [data]);

  if (error) {
    return <div>Error loading artists</div>;
  }

  if (isPending) {
    return <div>Loading artists...</div>;
  }

  return (
    <DataView<Artist>
      entity={ENTITIES.artist}
      data={{ artists: rows }}
      fieldsToShow={fieldsToShow}
      imageField="images"
      canCreate={false}
      mutations={{
        publish: (id) => publishArtistAsync({ artistId: id }),
        delete: (id) => archiveArtistAsync({ artistId: id }),
        restore: (id) => restoreArtistAsync({ artistId: id }),
      }}
      refetch={refetch}
      isPending={isPending}
      isFetching={isFetching}
      error={null}
      pagination={{ hasNextPage, fetchNextPage, isFetchingNextPage }}
      filters={{
        search,
        onSearchChange: (value) => setFilters('artists', { search: value }),
        showPublished,
        onShowPublishedChange: (value) => setFilters('artists', { showPublished: value }),
        showUnpublished,
        onShowUnpublishedChange: (value) => setFilters('artists', { showUnpublished: value }),
        showDeleted,
        onShowDeletedChange: (value) => setFilters('artists', { showDeleted: value }),
      }}
    />
  );
};
