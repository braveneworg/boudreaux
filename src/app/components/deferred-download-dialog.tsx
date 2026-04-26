/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cloneElement, isValidElement, useCallback, useMemo, useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';

import nextDynamic from 'next/dynamic';

import { useReleaseUserStatusQuery } from '@/app/hooks/use-release-user-status-query';
import { cn } from '@/lib/utils';

import { DownloadTriggerButton } from './download-trigger-button';

const DownloadDialog = nextDynamic(
  () => import('./download-dialog').then((mod) => ({ default: mod.DownloadDialog })),
  {
    ssr: false,
    // The visible trigger is rendered as a sibling above this dynamic
    // boundary, so the chunk-loading window doesn't need its own placeholder.
    // Returning null keeps the layout footprint stable on first tap (no FOUC,
    // no CLS) — previous behavior swapped the children out for a skeleton of
    // a different size.
    loading: () => null,
  }
);

interface DeferredDownloadDialogProps {
  artistName: string;
  releaseId: string;
  releaseTitle: string;
  /** Override styling for the default trigger button (merged via twMerge after defaults). */
  triggerClassName?: string;
  /**
   * Custom trigger element. When provided, replaces the default
   * `DownloadTriggerButton`. The element's `onClick` is preserved and
   * augmented to also lazy-mount the dialog on first click.
   */
  children?: ReactElement<{ onClick?: (event: MouseEvent<HTMLElement>) => void }>;
}

export const DeferredDownloadDialog = ({
  artistName,
  releaseId,
  releaseTitle,
  triggerClassName,
  children,
}: DeferredDownloadDialogProps) => {
  // Each tap increments openCounter, which is also the key on DownloadDialog.
  // Re-mounting on every tap forces openOnMount to fire again, so re-opens
  // after a close behave correctly. Trade-off: in-progress dialog state is
  // discarded between opens — acceptable since reopening is an explicit
  // "start over" gesture.
  const [openCounter, setOpenCounter] = useState(0);
  const { data: userStatus } = useReleaseUserStatusQuery(releaseId);

  const hasPurchase = userStatus?.hasPurchase ?? false;
  const purchasedAt = useMemo(
    () => (userStatus?.purchasedAt ? new Date(userStatus.purchasedAt) : null),
    [userStatus?.purchasedAt]
  );
  const downloadCount = userStatus?.downloadCount ?? 0;
  const resetInHours = userStatus?.resetInHours ?? null;
  const availableFormats = userStatus?.availableFormats ?? [];

  const handleTriggerClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      children?.props?.onClick?.(event);
      setOpenCounter((count) => count + 1);
    },
    [children]
  );

  const trigger =
    children && isValidElement(children) ? (
      cloneElement(children, { onClick: handleTriggerClick })
    ) : (
      <DownloadTriggerButton
        className={cn('mb-2 min-h-10', triggerClassName)}
        label="Download"
        onClick={handleTriggerClick}
      />
    );

  return (
    <>
      {trigger}
      {openCounter > 0 && (
        <DownloadDialog
          key={openCounter}
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
          {/* Radix DialogTrigger asChild requires a single React element child. The visible trigger lives above this dynamic boundary; this hidden span satisfies the API without participating in layout. */}
          <span aria-hidden="true" className="hidden" />
        </DownloadDialog>
      )}
    </>
  );
};
