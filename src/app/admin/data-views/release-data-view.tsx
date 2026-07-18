/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import {
  useDeleteReleaseMutation,
  usePublishReleaseMutation,
} from '@/app/hooks/mutations/use-release-mutations';
import { useDebounce } from '@/app/hooks/use-debounce';
import { useInfiniteReleasesQuery } from '@/app/hooks/use-infinite-releases-query';
import { ENTITIES } from '@/lib/constants';
import type { ReleaseListItem } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import { DataView } from './data-view';
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

/**
 * Computes the album artist display string from artistReleases
 */
const getAlbumArtist = (release: ReleaseListItem): string => {
  if (!release.artistReleases || release.artistReleases.length === 0) {
    return '-';
  }

  return release.artistReleases
    .map((ar: ReleaseListItem['artistReleases'][number]) => getDisplayName(ar.artist))
    .filter(Boolean)
    .join(', ');
};

export const ReleaseDataView = () => {
  const { publishReleaseAsync } = usePublishReleaseMutation();
  const { deleteReleaseAsync } = useDeleteReleaseMutation();
  const fieldsToShow = [
    'title',
    'albumArtist',
    'catalogNumber',
    'releasedOn',
    'formats',
    'createdAt',
    'updatedAt',
    'publishedAt',
  ];

  const { search, showPublished, showUnpublished, showDeleted } = useDataViewFilters(
    (state) => state.releases
  );
  const setFilters = useDataViewFilters((state) => state.setFilters);
  const hydrated = useDataViewFiltersHydration();
  const debouncedSearch = useDebounce(search);

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
  } = useInfiniteReleasesQuery(
    { search: debouncedSearch, published, deleted: showDeleted },
    { enabled: hydrated }
  );

  // Flatten the infinite pages and add the computed albumArtist field.
  const rows = useMemo(
    () =>
      data?.pages
        .flatMap((page) => page.rows)
        .map((release) => ({ ...release, albumArtist: getAlbumArtist(release) })) ?? [],
    [data]
  );

  if (error) {
    return <div>Error loading releases</div>;
  }

  if (isPending) {
    return <div>Loading releases...</div>;
  }

  return (
    <DataView<ReleaseListItem & { albumArtist: string }>
      entity={ENTITIES.release}
      data={{ releases: rows }}
      fieldsToShow={fieldsToShow}
      imageField="images"
      mutations={{
        publish: (id) => publishReleaseAsync({ releaseId: id }),
        delete: (id) => deleteReleaseAsync({ releaseId: id }),
      }}
      refetch={refetch}
      isPending={isPending}
      isFetching={isFetching}
      error={null}
      pagination={{ hasNextPage, fetchNextPage, isFetchingNextPage }}
      filters={{
        search,
        onSearchChange: (value) => setFilters('releases', { search: value }),
        showPublished,
        onShowPublishedChange: (value) => setFilters('releases', { showPublished: value }),
        showUnpublished,
        onShowUnpublishedChange: (value) => setFilters('releases', { showUnpublished: value }),
        showDeleted,
        onShowDeletedChange: (value) => setFilters('releases', { showDeleted: value }),
      }}
    />
  );
};
