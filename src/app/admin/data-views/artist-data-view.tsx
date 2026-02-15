/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import useArtistsQuery from '@/app/hooks/use-artists-query';
import { ENTITIES } from '@/lib/constants';
import type { Artist } from '@/lib/types/media-models';

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
      imageField="images"
      refetch={refetch}
      isPending={isPending}
    />
  );
};
