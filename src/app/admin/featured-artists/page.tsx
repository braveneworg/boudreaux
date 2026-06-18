/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Star } from 'lucide-react';

import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { SectionHeader } from '@/app/components/ui/section-header';

import { FeaturedArtistDataView } from '../data-views/featured-artist-data-view';

export const dynamic = 'force-dynamic';

export default function FeaturedArtistsPage() {
  return (
    <div className="space-y-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Featured Artists', url: '/admin/featured-artists', isActive: true },
        ]}
      />
      <SectionHeader
        icon={Star}
        title="Featured Artists"
        helpText="Curate the artists and tracks spotlighted on the public site, then publish the lineup."
      />
      <FeaturedArtistDataView />
    </div>
  );
}
