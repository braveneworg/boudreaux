/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';

import nextDynamic from 'next/dynamic';

import { DownloadTriggerButton } from './download-trigger-button';

const DownloadDialog = nextDynamic(
  () => import('./download-dialog').then((mod) => ({ default: mod.DownloadDialog })),
  {
    ssr: false,
    loading: () => <div className="h-10 w-40 animate-pulse bg-muted rounded mb-2 min-h-10" />,
  }
);

interface DeferredDownloadDialogProps {
  artistName: string;
  releaseId: string;
  releaseTitle: string;
}

export const DeferredDownloadDialog = ({
  artistName,
  releaseId,
  releaseTitle,
}: DeferredDownloadDialogProps) => {
  const [shouldRenderDialog, setShouldRenderDialog] = useState(false);

  if (!shouldRenderDialog) {
    return (
      <DownloadTriggerButton
        className="mb-2 min-h-10"
        label="Download release"
        onClick={() => {
          setShouldRenderDialog(true);
        }}
      />
    );
  }

  return (
    <DownloadDialog
      artistName={artistName}
      openOnMount
      releaseId={releaseId}
      releaseTitle={releaseTitle}
    >
      <DownloadTriggerButton className="mb-2 min-h-10" label="Download release" />
    </DownloadDialog>
  );
};
