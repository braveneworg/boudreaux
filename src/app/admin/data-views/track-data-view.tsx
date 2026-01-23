'use client';

import useTracksQuery from '@/app/hooks/use-tracks-query';
import { ENTITIES } from '@/lib/constants';
import type { Track } from '@/lib/types/media-models';

import { DataView } from './data-view';

export const TrackDataView = () => {
  const fieldsToShow = ['title', 'duration', 'audioUrl', 'position', 'createdAt', 'updatedAt'];
  const { isPending, error, data, refetch } = useTracksQuery();

  if (error) {
    return <div>Error loading tracks</div>;
  }

  if (isPending) {
    return <div>Loading tracks...</div>;
  }

  return (
    <DataView<Track>
      entity={ENTITIES.track}
      data={data}
      fieldsToShow={fieldsToShow}
      imageField="images"
      refetch={refetch}
      isPending={isPending}
    />
  );
};
