/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Disc } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';

import { ReleaseDataView } from '../data-views/release-data-view';

export const dynamic = 'force-dynamic';

export default function ReleasesPage() {
  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Releases', url: '/admin/releases', isActive: true },
      ]}
    >
      <SectionHeader
        icon={Disc}
        title="Releases"
        helpText="Create, publish, and manage music releases and their digital formats. Use the toggles to filter by published, unpublished, or deleted."
      />
      <ReleaseDataView />
    </ZinePanel>
  );
}
