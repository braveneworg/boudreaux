/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';

interface PurchaseConfirmedStepProps {
  releaseTitle: string;
  purchasedAt: Date | null;
  downloadCount: number;
  resetInHours: number | null;
  onContinue: () => void;
}

export const PurchaseConfirmedStep = ({
  releaseTitle,
  purchasedAt,
  downloadCount,
  resetInHours,
  onContinue,
}: PurchaseConfirmedStepProps): React.ReactElement => (
  <>
    <DialogHeader>
      <DialogTitle>Download</DialogTitle>
      <DialogDescription>
        You&apos;ve already purchased <strong>{releaseTitle}</strong>
      </DialogDescription>
    </DialogHeader>

    <p className="text-sm text-zinc-900">
      Purchased on{' '}
      <strong>
        {purchasedAt
          ? new Date(purchasedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : 'a previous date'}
      </strong>
      .
    </p>

    {downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT ? (
      <>
        <Button className="w-full" type="button" disabled>
          <DownloadIcon className="size-4" />
          Download limit reached
        </Button>
        <p className="text-sm text-zinc-950">
          You&apos;ve reached your download limit for <strong>{releaseTitle}</strong>.
          {resetInHours !== null
            ? ` Resets in ${resetInHours} hour${resetInHours === 1 ? '' : 's'}.`
            : ''}
        </p>
      </>
    ) : (
      <Button className="w-full" type="button" onClick={onContinue}>
        <DownloadIcon className="size-4" />
        Continue
      </Button>
    )}
  </>
);
