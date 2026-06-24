/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { AlertCircle, CheckCircle2, FileAudio, Loader2 } from 'lucide-react';

import type { UploadState } from '@/types/digital-format';

interface StatusIconProps {
  state: UploadState;
  uploaded: boolean;
  uploading: boolean;
}

export const StatusIcon = ({ state, uploaded, uploading }: StatusIconProps) => {
  if (uploaded || state.status === 'success') {
    return (
      <CheckCircle2
        className="h-5 w-5 text-green-600"
        data-testid="format-uploaded-checkmark"
        aria-label="Format uploaded"
      />
    );
  }
  if (uploading) {
    return <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-label="Uploading" />;
  }
  if (state.status === 'error') {
    return <AlertCircle className="text-destructive h-5 w-5" aria-label="Upload failed" />;
  }
  return <FileAudio className="h-5 w-5 text-zinc-950" />;
};
