'use client';

import { useCallback } from 'react';

import useFeaturedArtistsQuery from '@/app/hooks/use-featured-artists-query';
import { ENTITIES } from '@/lib/constants';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';

import { DataView } from './data-view';

export const FeaturedArtistDataView = () => {
  const fieldsToShow = [
    'displayName',
    'featuredOn',
    'position',
    'description',
    'createdAt',
    'updatedAt',
    'publishedOn',
  ];
  const { isPending, error, data, refetch } = useFeaturedArtistsQuery();

  const getSearchableText = useCallback((item: FeaturedArtist) => {
    const parts: string[] = [];
    if (item.displayName) parts.push(item.displayName);
    if (item.description) parts.push(item.description);
    if (item.artists) {
      for (const artist of item.artists) {
        if (artist.displayName) parts.push(artist.displayName);
      }
    }
    if (item.group) {
      if (item.group.name) parts.push(item.group.name);
      if (item.group.displayName) parts.push(item.group.displayName);
    }
    return parts.join(' ');
  }, []);

  if (error) {
    return <div>Error loading featured artists</div>;
  }

  if (isPending) {
    return <div>Loading featured artists...</div>;
  }

  return (
    <DataView<FeaturedArtist>
      entity={ENTITIES.featuredArtist}
      data={data}
      fieldsToShow={fieldsToShow}
      refetch={refetch}
      isPending={isPending}
      getItemDisplayName={getFeaturedArtistDisplayName}
      getSearchableText={getSearchableText}
    />
  );
};
