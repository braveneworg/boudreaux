/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Star } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';

import { FeaturedArtistDataView } from '../data-views/featured-artist-data-view';

export const dynamic = 'force-dynamic';

export default function FeaturedArtistsPage() {
  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Featured Artists', url: '/admin/featured-artists', isActive: true },
      ]}
    >
      <SectionHeader
        icon={Star}
        title="Featured Artists"
        helpText="Curate the artists and tracks spotlighted on the public site, then publish the lineup."
      />
      <FeaturedArtistDataView />
    </ZinePanel>
  );
}
