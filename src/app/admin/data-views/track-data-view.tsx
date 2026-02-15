/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import useInfiniteTracksQuery from '@/app/hooks/use-infinite-tracks-query';
import { ENTITIES } from '@/lib/constants';
import type { Track } from '@/lib/types/media-models';

import { DataView } from './data-view';

export const TrackDataView = () => {
  const fieldsToShow = ['title', 'duration', 'audioUrl', 'position', 'createdAt', 'updatedAt'];
  const { isPending, error, tracks, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteTracksQuery();

  if (error) {
    return <div>Error loading tracks</div>;
  }

  if (isPending) {
    return <div>Loading tracks...</div>;
  }

  return (
    <DataView<Track>
      entity={ENTITIES.track}
      data={{ tracks: tracks as Track[] }}
      fieldsToShow={fieldsToShow}
      imageField="images"
      coverArtField="coverArt"
      refetch={refetch}
      isPending={isPending}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
    />
  );
};
