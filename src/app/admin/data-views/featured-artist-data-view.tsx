'use client';

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
    />
  );
};
