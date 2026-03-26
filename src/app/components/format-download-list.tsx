/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';

/**
 * Human-readable labels for digital format types
 */
const FORMAT_LABELS: Record<string, string> = {
  MP3_V0: 'MP3 V0',
  MP3_320KBPS: 'MP3 320kbps',
  AAC: 'AAC',
  OGG_VORBIS: 'Ogg Vorbis',
  FLAC: 'FLAC',
  ALAC: 'ALAC',
  WAV: 'WAV',
  AIFF: 'AIFF',
};

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
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);

  // Fetch quota status on mount for non-purchasers
  useEffect(() => {
    if (hasPurchased) return;

    const fetchQuota = async () => {
      try {
        const response = await fetch('/api/user/download-quota');

        if (!response.ok) return;

        const data = await response.json();

        if (data.success) {
          setRemainingQuota(data.remainingQuota);

          // Quota is exceeded only if this release hasn't been downloaded yet
          const alreadyDownloaded = data.downloadedReleaseIds?.includes(releaseId);

          if (!alreadyDownloaded && data.remainingQuota <= 0) {
            setQuotaExceeded(true);
          }
        }
      } catch {
        // Silently fail — quota check is a UX enhancement, not critical
      }
    };

    fetchQuota();
  }, [hasPurchased, releaseId]);

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

        // Trigger browser download via temporary anchor element
        const anchor = document.createElement('a');
        anchor.href = data.downloadUrl;
        anchor.download = data.fileName;
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
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
