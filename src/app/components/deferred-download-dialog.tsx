/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import nextDynamic from 'next/dynamic';

import { useReleaseUserStatusQuery } from '@/app/hooks/use-release-user-status-query';
import { cn } from '@/lib/utils';

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
  /** Override styling for the trigger button (merged via twMerge after defaults). */
  triggerClassName?: string;
}

export const DeferredDownloadDialog = ({
  artistName,
  releaseId,
  releaseTitle,
  triggerClassName,
}: DeferredDownloadDialogProps) => {
  const [shouldRenderDialog, setShouldRenderDialog] = useState(false);
  const { data: userStatus } = useReleaseUserStatusQuery(releaseId);

  const hasPurchase = userStatus?.hasPurchase ?? false;
  const purchasedAt = useMemo(
    () => (userStatus?.purchasedAt ? new Date(userStatus.purchasedAt) : null),
    [userStatus?.purchasedAt]
  );
  const downloadCount = userStatus?.downloadCount ?? 0;
  const resetInHours = userStatus?.resetInHours ?? null;
  const availableFormats = userStatus?.availableFormats ?? [];

  if (!shouldRenderDialog) {
    return (
      <DownloadTriggerButton
        className={cn('mb-2 min-h-10', triggerClassName)}
        label="Download"
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
      hasPurchase={hasPurchase}
      purchasedAt={purchasedAt}
      downloadCount={downloadCount}
      resetInHours={resetInHours}
      availableFormats={availableFormats}
    >
      <DownloadTriggerButton className={cn('mb-2 min-h-10', triggerClassName)} label="Download" />
    </DownloadDialog>
  );
};
