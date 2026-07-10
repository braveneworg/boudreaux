/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Button } from '@/app/components/ui/button';
import { CardFooter } from '@/app/components/ui/card';

interface VideoFormFooterProps {
  isSubmitting: boolean;
  isUploading: boolean;
  onCancel: () => void;
}

/** Save + Cancel footer. Save is blocked while a multipart upload is in flight. */
export const VideoFormFooter = ({
  isSubmitting,
  isUploading,
  onCancel,
}: VideoFormFooterProps): React.ReactElement => (
  <CardFooter className="flex justify-end gap-4 px-0">
    <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
      Cancel
    </Button>
    <Button type="submit" disabled={isSubmitting || isUploading}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </Button>
  </CardFooter>
);
