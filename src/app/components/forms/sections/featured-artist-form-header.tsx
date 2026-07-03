/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Star } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';

interface FeaturedArtistFormHeaderProps {
  isEditMode: boolean;
}

export const FeaturedArtistFormHeader = ({
  isEditMode,
}: FeaturedArtistFormHeaderProps): React.ReactElement => (
  <>
    {/* The breadcrumb docks inside the form's storm panel. */}
    <div className="space-y-1">
      <SectionHeader
        icon={Star}
        title={isEditMode ? 'Edit Featured Artist' : 'Create Featured Artist'}
        helpText="Spotlight an artist and track on the landing page. Associate a release; the MP3 320kbps format is used for playback."
      />
      <p className="text-muted-foreground text-sm">
        {isEditMode
          ? 'Update the featured artist details below.'
          : 'Create a new featured artist entry to highlight on the landing page.'}
      </p>
    </div>
  </>
);
