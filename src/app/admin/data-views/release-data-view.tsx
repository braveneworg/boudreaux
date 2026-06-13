/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { useDebounce } from '@/app/hooks/use-debounce';
import { useReleasesQuery } from '@/app/hooks/use-releases-query';
import { ENTITIES } from '@/lib/constants';
import type { Release } from '@/lib/types/media-models';
import { getDisplayName } from '@/lib/utils/get-display-name';

import { DataView } from './data-view';

/**
 * Computes the album artist display string from artistReleases
 */
const getAlbumArtist = (release: Release): string => {
  if (!release.artistReleases || release.artistReleases.length === 0) {
    return '-';
  }

  return release.artistReleases
    .map((ar: Release['artistReleases'][number]) => getDisplayName(ar.artist))
    .filter(Boolean)
    .join(', ');
};

export const ReleaseDataView = () => {
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

  const [search, setSearch] = useState('');
  const [showPublished, setShowPublished] = useState(true);
  const [showUnpublished, setShowUnpublished] = useState(true);
  const [showDeleted, setShowDeleted] = useState(false);
  const debouncedSearch = useDebounce(search);

  // Both same → no publish filter; otherwise the enabled one.
  const published = showPublished === showUnpublished ? null : showPublished;

  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useReleasesQuery({ search: debouncedSearch, published, deleted: showDeleted });

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
    <DataView<Release & { albumArtist: string }>
      entity={ENTITIES.release}
      data={{ releases: rows }}
      fieldsToShow={fieldsToShow}
      imageField="images"
      forceHardDelete
      refetch={refetch}
      isPending={isPending}
      error={null}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      searchValue={search}
      onSearchChange={setSearch}
      showPublished={showPublished}
      onShowPublishedChange={setShowPublished}
      showUnpublished={showUnpublished}
      onShowUnpublishedChange={setShowUnpublished}
      showDeleted={showDeleted}
      onShowDeletedChange={setShowDeleted}
    />
  );
};
