'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Combobox } from '@/components/forms/fields/combobox';
import { toTitleCase } from '@/lib/utils/string-utils';

import { ArtistDataView } from './data-views/artist-data-view';
import { FeaturedArtistDataView } from './data-views/featured-artist-data-view';
import { GroupDataView } from './data-views/group-data-view';
import { ReleaseDataView } from './data-views/release-data-view';
import { TrackDataView } from './data-views/track-data-view';
import { BreadcrumbMenu } from '../components/ui/breadcrumb-menu';

export default function AdminPage() {
  const [view, setView] = useState('artist');
  const router = useRouter();

  const switchView = (selectedView: string) => {
    // Notifications has its own dedicated page
    if (selectedView === 'notifications') {
      router.push('/admin/notifications');
      return;
    }
    setView(selectedView);
  };

  const getEntityOptions = useCallback(() => {
    const entities = ['artist', 'group', 'release', 'track', 'featured artist', 'notifications'];
    return entities.map((entity) => ({
      value: entity.toLowerCase(),
      label: toTitleCase(entity),
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
        onSelectAction={(selectedView) => {
          switchView(selectedView);
        }}
      />
      {view === 'artist' && <ArtistDataView />}
      {view === 'group' && <GroupDataView />}
      {view === 'release' && <ReleaseDataView />}
      {view === 'track' && <TrackDataView />}
      {view === 'featured artist' && <FeaturedArtistDataView />}
    </>
  );
}
