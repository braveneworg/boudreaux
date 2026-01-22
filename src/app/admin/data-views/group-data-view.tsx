'use client';

import useGroupsQuery from '@/app/hooks/use-groups-query';
import { ENTITIES } from '@/lib/constants';
import type { Group } from '@/lib/types/media-models';

import { DataView } from './data-view';

export const GroupDataView = () => {
  const fieldsToShow = [
    'name',
    'displayName',
    'formedOn',
    'endedOn',
    'createdAt',
    'updatedAt',
    'publishedOn',
  ];
  const { isPending, error, data, refetch } = useGroupsQuery();

  if (error) {
    return <div>Error loading groups</div>;
  }

  if (isPending) {
    return <div>Loading groups...</div>;
  }

  return (
    <DataView<Group>
      entity={ENTITIES.group}
      data={data}
      fieldsToShow={fieldsToShow}
      imageField="images"
      refetch={refetch}
      isPending={isPending}
    />
  );
};
