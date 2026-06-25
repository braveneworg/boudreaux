/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { FORMAT_CONFIGS } from '@/lib/constants/format-configs';

interface ReleaseCardHeaderProps {
  isEditMode: boolean;
}

export const ReleaseCardHeader = ({ isEditMode }: ReleaseCardHeaderProps): React.ReactElement => (
  <CardHeader>
    <CardTitle>{isEditMode ? 'Edit Release' : 'Create New Release'}</CardTitle>
    <CardDescription className="text-sm">
      {isEditMode
        ? 'Update release information. Changes are saved when you click Save.'
        : `Upload ${FORMAT_CONFIGS[0].label} first. Creates the release upon upload.`}
    </CardDescription>
  </CardHeader>
);
