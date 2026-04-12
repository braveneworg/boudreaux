/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { useDownloadQuotaQuery } from '@/app/hooks/use-download-quota-query';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface FormatDownloadListProps {
  releaseId: string;
  formats: AvailableFormat[];
  /** Whether the user has purchased this release (bypasses quota) */
  hasPurchased?: boolean;
}

/**
 * FormatDownloadList — renders a list of available digital formats with
 * individual download buttons. Each button calls the format-specific
 * download authorization endpoint, retrieves a presigned S3 URL,
 * and triggers a browser download.
 *
 * When the user has not purchased and their free download quota is exceeded,
 * buttons are disabled with an explanatory message.
 */
export const FormatDownloadList = ({
  releaseId,
  formats,
  hasPurchased = false,
}: FormatDownloadListProps) => {
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: quotaData } = useDownloadQuotaQuery(!hasPurchased);
  const remainingQuota = quotaData?.remainingQuota ?? null;
  const quotaExceeded =
    !hasPurchased &&
    quotaData?.success &&
    !quotaData.downloadedReleaseIds?.includes(releaseId) &&
    quotaData.remainingQuota <= 0;

  const handleDownload = useCallback(
    async (formatType: string) => {
      setDownloadingFormat(formatType);
      setError(null);

      try {
        const response = await fetch(`/api/releases/${releaseId}/download/${formatType}`);

        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.message || 'Download failed. Please try again.');
          return;
        }

        // Use window.open for presigned S3 URL downloads — iOS Safari
        // ignores the download attribute on programmatic anchor elements.
        window.open(data.downloadUrl, '_blank', 'noopener,noreferrer');
      } catch {
        setError('An unexpected error occurred. Please try again.');
      } finally {
        setDownloadingFormat(null);
      }
    },
    [releaseId]
  );

  if (formats.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Choose a format:</p>
      {!hasPurchased && remainingQuota !== null && !quotaExceeded && (
        <p className="text-muted-foreground text-xs">
          {remainingQuota} free {remainingQuota === 1 ? 'download' : 'downloads'} remaining
        </p>
      )}
      {quotaExceeded && (
        <p className="text-destructive text-sm" role="alert" data-testid="quota-exceeded-message">
          You&apos;ve reached your free download limit. Purchase this release to continue
          downloading.
        </p>
      )}
      {formats.map(({ formatType }) => {
        const isDownloading = downloadingFormat === formatType;
        return (
          <Button
            key={formatType}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            disabled={isDownloading || quotaExceeded}
            onClick={() => handleDownload(formatType)}
          >
            {isDownloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {FORMAT_LABELS[formatType] ?? formatType}
          </Button>
        );
      })}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
