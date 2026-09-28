/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import { CreditConfirmationDialog } from '@/components/credit-confirmation-dialog';
import {
  useDeleteReleaseMutation,
  usePublishReleaseMutation,
} from '@/hooks/mutations/use-release-mutations';
import { useCreditDecisions } from '@/hooks/use-credit-decisions';
import { useDebounce } from '@/hooks/use-debounce';
import { ENTITIES } from '@/lib/constants';
import type { ReleaseListItem } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import { useInfiniteReleasesQuery } from './_hooks/use-infinite-releases-query';
import { DataView } from './data-view';
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

import type { EntityMutationResult } from './data-view-types';

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
  const { requestDecisions, confirmation, confirm, cancel } = useCreditDecisions();

  // A release publishes its credited artists only by confirmation (ADR-0015):
  // ask the admin about each one before the publish is sent.
  const publishRelease = useCallback(
    async (releaseId: string): Promise<EntityMutationResult> => {
      const decisions = await requestDecisions({ releaseId });
      if (!decisions) {
        return { success: false, cancelled: true };
      }
      return publishReleaseAsync({ releaseId, decisions });
    },
    [requestDecisions, publishReleaseAsync]
  );
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
    <>
      <CreditConfirmationDialog
        confirmation={confirmation}
        confirmLabel="Publish release"
        onConfirm={confirm}
        onCancel={cancel}
      />
      <DataView<ReleaseListItem & { albumArtist: string }>
        entity={ENTITIES.release}
        data={{ releases: rows }}
        fieldsToShow={fieldsToShow}
        imageField="images"
        forceHardDelete
        mutations={{
          publish: publishRelease,
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
    </>
  );
};
