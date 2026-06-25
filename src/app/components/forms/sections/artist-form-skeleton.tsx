/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Users } from 'lucide-react';

import { SectionHeader } from '@/app/components/ui/section-header';

interface ArtistFormSkeletonProps {
  isEditMode: boolean;
}

export const ArtistFormSkeleton = ({ isEditMode }: ArtistFormSkeletonProps): React.ReactElement => (
  <div className="space-y-6">
    <SectionHeader
      icon={Users}
      title={isEditMode ? 'Edit Artist' : 'Create New Artist'}
      helpText="Loading artist details…"
    />
    <div className="space-y-4">
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
      <div className="bg-muted h-10 w-full animate-pulse rounded-md" />
    </div>
  </div>
);
