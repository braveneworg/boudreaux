/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2Icon } from 'lucide-react';

import { FormatBundleDownload } from '@/app/components/format-bundle-download';
import { DialogDescription, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { useReleaseDigitalFormatsQuery } from '@/app/hooks/use-release-digital-formats-query';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: DigitalFormatType;
  fileName: string;
}

interface PurchaseSuccessStepProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats?: AvailableFormat[];
  downloadCount?: number;
  onDownloadComplete?: () => void;
}

/**
 * Final step shown after a PWYW purchase is confirmed.
 * Fetches available digital formats from the API to ensure
 * fresh data, falling back to the prop value if provided.
 */
export const PurchaseSuccessStep = ({
  releaseId,
  releaseTitle,
  availableFormats: initialFormats,
  downloadCount = 0,
  onDownloadComplete,
}: PurchaseSuccessStepProps) => {
  const { isPending: isLoading, data } = useReleaseDigitalFormatsQuery(releaseId);
  const resolvedFormats = data?.formats ?? initialFormats ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Purchase Complete!</DialogTitle>
        <DialogDescription>Your payment for {releaseTitle} was confirmed.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4" role="status">
            <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : resolvedFormats.length > 0 ? (
          <FormatBundleDownload
            releaseId={releaseId}
            releaseTitle={releaseTitle}
            availableFormats={resolvedFormats}
            downloadCount={downloadCount}
            onDownloadComplete={onDownloadComplete}
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            No digital formats available for download.
          </p>
        )}

        <p className="text-muted-foreground text-sm">
          A confirmation email with your download link is also on its way.
        </p>
      </div>
    </>
  );
};
