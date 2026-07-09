/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Clapperboard } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';
import { ZinePanel } from '@/app/components/ui/zine-panel';

import { VideoDataView } from '../data-views/video-data-view';

export const dynamic = 'force-dynamic';

export default function VideosPage() {
  return (
    <ZinePanel
      accent="storm"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: 'Videos', url: '/admin/videos', isActive: true },
      ]}
    >
      <SectionHeader
        icon={Clapperboard}
        title="Videos"
        helpText="Upload, publish, and manage music and informational videos. Use the toggles to filter by published, unpublished, or archived, and search by title, artist, or description."
      />
      <VideoDataView />
    </ZinePanel>
  );
}
