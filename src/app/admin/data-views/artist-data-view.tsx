'use client';

import type { Artist } from '@/app/components/ui/audio/types';
import useArtistsQuery from '@/app/hooks/use-artists-query';
import { ENTITIES } from '@/lib/constants';

import { DataView } from './data-view';

export const ArtistDataView = () => {
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
  const { isPending, error, data, refetch } = useArtistsQuery();

  if (error) {
    return <div>Error loading artists</div>;
  }

  if (isPending) {
    return <div>Loading artists...</div>;
  }

  return (
    <DataView<Artist>
      entity={ENTITIES.artist}
      data={data}
      fieldsToShow={fieldsToShow}
      refetch={refetch}
      isPending={isPending}
    />
  );
};
