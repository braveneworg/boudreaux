/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { DownloadIcon } from 'lucide-react';

import { FormatBundleDownload } from '@/app/components/format-bundle-download';
import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: DigitalFormatType;
  fileName: string;
}

interface FormatSelectStepProps {
  releaseId: string;
  releaseTitle: string;
  hasPurchase: boolean;
  purchasedAt: Date | null;
  downloadCount: number;
  resetInHours: number | null;
  availableFormats: AvailableFormat[];
  onDownloadComplete: () => void;
}

export const FormatSelectStep = ({
  releaseId,
  releaseTitle,
  hasPurchase,
  purchasedAt,
  downloadCount,
  resetInHours,
  availableFormats,
  onDownloadComplete,
}: FormatSelectStepProps): React.ReactElement => (
  <>
    <DialogHeader>
      <DialogTitle>{hasPurchase ? 'Download Again' : 'Download'}</DialogTitle>
      <DialogDescription>
        Select formats for <strong>{releaseTitle}</strong>
      </DialogDescription>
    </DialogHeader>

    {hasPurchase ? (
      <p className="text-sm text-zinc-900">
        You already purchased this on{' '}
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
    ) : null}

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
      <FormatBundleDownload
        releaseId={releaseId}
        availableFormats={availableFormats}
        downloadCount={downloadCount}
        onDownloadComplete={onDownloadComplete}
      />
    )}
  </>
);
