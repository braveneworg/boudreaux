/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Users } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';

interface ArtistFormHeaderProps {
  isEditMode: boolean;
}

export const ArtistFormHeader = ({ isEditMode }: ArtistFormHeaderProps): React.ReactElement => (
  <div className="space-y-1">
    <SectionHeader
      icon={Users}
      title={isEditMode ? 'Edit Artist' : 'Create New Artist'}
      helpText="Manage the artist's name, images, biography, music metadata, and key dates. Required fields are marked with an asterisk."
    />
    <p className="text-muted-foreground text-sm">
      {isEditMode
        ? 'Update artist information. Changes are saved when you click Save.'
        : 'Required fields are marked with an asterisk *'}
    </p>
  </div>
);
