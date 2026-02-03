'use client';

import { useMemo } from 'react';

import useReleasesQuery from '@/app/hooks/use-releases-query';
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
    .map((ar) => getDisplayName(ar.artist))
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
  const { isPending, error, data, refetch } = useReleasesQuery();

  // Transform data to add computed albumArtist field
  const transformedData = useMemo(() => {
    if (!data?.releases) return null;

    const releasesWithArtist = data.releases.map((release: Release) => ({
      ...release,
      albumArtist: getAlbumArtist(release),
    }));

    return { releases: releasesWithArtist };
  }, [data]);

  if (error) {
    return <div>Error loading releases</div>;
  }

  if (isPending) {
    return <div>Loading releases...</div>;
  }

  return (
    <DataView<Release & { albumArtist: string }>
      entity={ENTITIES.release}
      data={transformedData}
      fieldsToShow={fieldsToShow}
      imageField="images"
      refetch={refetch}
      isPending={isPending}
    />
  );
};
