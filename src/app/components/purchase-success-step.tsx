/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { DownloadIcon } from 'lucide-react';

import { FormatBundleDownload } from '@/app/components/format-bundle-download';
import { Button } from '@/app/components/ui/button';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface PurchaseSuccessStepProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats?: AvailableFormat[];
  downloadCount?: number;
}

/**
 * Final step shown after a PWYW purchase is confirmed.
 * When digital formats are available, displays the format bundle picker.
 * When digital formats are explicitly unavailable (empty array), displays a
 *   "No digital formats available for download." message.
 * When digital formats are not provided (undefined), falls back to the
 *   legacy download link.
 */
export const PurchaseSuccessStep = ({
  releaseId,
  releaseTitle,
  availableFormats,
  downloadCount = 0,
}: PurchaseSuccessStepProps) => {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Purchase Complete!</DialogTitle>
        <DialogDescription>Your payment for {releaseTitle} was confirmed.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {availableFormats !== undefined ? (
          availableFormats.length > 0 ? (
            <FormatBundleDownload
              releaseId={releaseId}
              releaseTitle={releaseTitle}
              availableFormats={availableFormats}
              downloadCount={downloadCount}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No digital formats available for download.
            </p>
          )
        ) : (
          <Button asChild variant="default" className="w-full">
            <Link href={`/api/releases/${releaseId}/download`}>
              <DownloadIcon className="size-4" />
              Download Now
            </Link>
          </Button>
        )}

        <p className="text-muted-foreground text-sm">
          A confirmation email with your download link is on its way.
        </p>

        <p className="text-muted-foreground text-sm">
          You can download up to {MAX_RELEASE_DOWNLOAD_COUNT} times.
        </p>
      </div>
    </>
  );
};
