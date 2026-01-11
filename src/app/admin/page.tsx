'use client';

import { useCallback, useState } from 'react';

import { Combobox } from '@/components/forms/fields/combobox';
import { toPascalCase } from '@/lib/utils/string-utils';

import { ArtistDataView } from './data-views/artist-data-view';
import { GroupDataView } from './data-views/group-data-view';
import { BreadcrumbMenu } from '../components/ui/breadcrumb-menu';

export default function AdminPage() {
  const [view, setView] = useState('artist');

  const switchView = (view: string) => {
    setView(view);
  };

  const getEntityOptions = useCallback(() => {
    const entities = ['artist', 'group', 'release', 'track', 'featured artist'];
    return entities.map((entity) => ({
      value: entity.toLowerCase(),
      label: toPascalCase(entity),
    }));
  }, []);

  return (
    <>
      <BreadcrumbMenu
        items={[
          {
            anchorText: 'Admin',
            url: '/admin',
            isActive: true,
          },
        ]}
      />
      <Combobox
        className="mt-1.5 mb-4 w-full"
        options={getEntityOptions()}
        onSelectAction={(view) => {
          switchView(view);
        }}
      />
      {view === 'artist' && <ArtistDataView />}
      {view === 'group' && <GroupDataView />}
      {/* {view === 'release' && <ReleaseDataView />} and so on; kind of like a switch case */}
    </>
  );
}
