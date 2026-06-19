/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Users } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { SectionHeader } from '@/app/components/ui/section-header';

import { ArtistDataView } from '../data-views/artist-data-view';

export const dynamic = 'force-dynamic';

export default function ArtistsPage() {
  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Artists', url: '/admin/artists', isActive: true },
        ]}
      />
      <SectionHeader
        icon={Users}
        title="Artists"
        helpText="Update and manage the artist roster. New artists are added while editing a release, not from this page."
      />
      <ArtistDataView />
    </div>
  );
}
