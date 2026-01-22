'use client';

import useReleasesQuery from '@/app/hooks/use-releases-query';
import { ENTITIES } from '@/lib/constants';
import type { Release } from '@/lib/types/media-models';

import { DataView } from './data-view';

export const ReleaseDataView = () => {
  const fieldsToShow = [
    'title',
    'catalogNumber',
    'releasedOn',
    'formats',
    'createdAt',
    'updatedAt',
    'publishedAt',
  ];
  const { isPending, error, data, refetch } = useReleasesQuery();

  if (error) {
    return <div>Error loading releases</div>;
  }

  if (isPending) {
    return <div>Loading releases...</div>;
  }

  return (
    <DataView<Release>
      entity={ENTITIES.release}
      data={data}
      fieldsToShow={fieldsToShow}
      imageField="images"
      refetch={refetch}
      isPending={isPending}
    />
  );
};
