/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';

interface ReleaseFormSkeletonProps {
  isEditMode: boolean;
}

export const ReleaseFormSkeleton = ({
  isEditMode,
}: ReleaseFormSkeletonProps): React.ReactElement => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>{isEditMode ? 'Edit Release' : 'Create New Release'}</CardTitle>
      <CardDescription>Loading...</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <div className="bg-muted h-10 w-full animate-pulse" />
        <div className="bg-muted h-10 w-full animate-pulse" />
        <div className="bg-muted h-10 w-full animate-pulse" />
      </div>
    </CardContent>
  </Card>
);
