/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo } from 'react';

import { Badge } from '@/app/components/ui/badge';
import { HidingWarningDialog } from '@/components/hiding-warning-dialog';
import {
  useDeleteArtistMutation,
  usePublishArtistMutation,
  useRestoreArtistMutation,
} from '@/hooks/mutations/use-artist-mutations';
import { useDebounce } from '@/hooks/use-debounce';
import { useGuardedArtistArchive } from '@/hooks/use-guarded-artist-archive';
import { ENTITIES } from '@/lib/constants';
import type { ArtistListItem } from '@/lib/types/domain/artist';

import { useInfiniteArtistsQuery } from './_hooks/use-infinite-artists-query';
import { DataView } from './data-view';
import { useDataViewFilters, useDataViewFiltersHydration } from './use-data-view-filters';

/**
 * Publishing needs a chosen display image (ADR-0019); the list flags an
 * artist that has none, published or not, so the admin sees it before the
 * Publish action refuses.
 */
const artistBadges = ({ hasDisplayImage }: ArtistListItem) =>
  hasDisplayImage ? null : <Badge variant="outline">No display image</Badge>;

export const ArtistDataView = () => {
  const { publishArtistAsync } = usePublishArtistMutation();
  // Archiving hides the artist: warn which public work loses the name first.
  const { archiveArtist, warning } = useGuardedArtistArchive();
  const { restoreArtistAsync } = useRestoreArtistMutation();
  const { deleteArtistAsync } = useDeleteArtistMutation();
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
    <>
      <HidingWarningDialog {...warning} />
      <DataView<ArtistListItem>
        entity={ENTITIES.artist}
        data={{ artists: rows }}
        fieldsToShow={fieldsToShow}
        canCreate={false}
        renderBadges={artistBadges}
        mutations={{
          publish: (id) => publishArtistAsync({ artistId: id }),
          delete: archiveArtist,
          restore: (id) => restoreArtistAsync({ artistId: id }),
          hardDelete: (id) => deleteArtistAsync({ artistId: id }),
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
    </>
  );
};
