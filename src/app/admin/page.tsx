/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Combobox } from '@/components/forms/fields/combobox';
import { toTitleCase } from '@/lib/utils/string-utils';

import { ArtistDataView } from './data-views/artist-data-view';
import { FeaturedArtistDataView } from './data-views/featured-artist-data-view';
import { ReleaseDataView } from './data-views/release-data-view';
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
    // Tours has its own dedicated page
    if (selectedView === 'tours') {
      router.push('/admin/tours');
      return;
    }
    setView(selectedView);
  };

  const getEntityOptions = useCallback(() => {
    const entities = ['artist', 'release', 'featured artist', 'notifications', 'tours'];
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
      {view === 'release' && <ReleaseDataView />}
      {view === 'featured artist' && <FeaturedArtistDataView />}
    </>
  );
}
