/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { useDownloadQuotaQuery } from '@/app/hooks/use-download-quota-query';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

/**
 * Lookup map for format labels keyed by format type. Backed by a `Map` so
 * dynamic format-type keys are read without object-injection risk; falls back
 * to the raw format type when no label is registered.
 */
const FORMAT_LABEL_MAP = new Map(Object.entries(FORMAT_LABELS));
const getFormatLabel = (formatType: string): string =>
  FORMAT_LABEL_MAP.get(formatType) ?? formatType;

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

/** Minimal shape of the download-quota query payload this component reads. */
interface DownloadQuota {
  success?: boolean;
  remainingQuota?: number;
  downloadedReleaseIds?: string[];
}

/**
 * Whether free-download buttons should be disabled: the user hasn't purchased,
 * the quota query succeeded, this release isn't already in their downloaded set,
 * and no free downloads remain.
 */
const isQuotaExceeded = (
  hasPurchased: boolean,
  releaseId: string,
  quotaData: DownloadQuota | undefined
): boolean =>
  !hasPurchased &&
  Boolean(quotaData?.success) &&
  !quotaData?.downloadedReleaseIds?.includes(releaseId) &&
  (quotaData?.remainingQuota ?? 0) <= 0;

interface FormatDownloadListProps {
  releaseId: string;
  formats: AvailableFormat[];
  /** Whether the user has purchased this release (bypasses quota) */
  hasPurchased?: boolean;
}

interface QuotaStatusProps {
  hasPurchased: boolean;
  remainingQuota: number | null;
  quotaExceeded: boolean;
}

/** Remaining-quota hint or the "limit reached" alert shown above the format buttons. */
const QuotaStatus = ({ hasPurchased, remainingQuota, quotaExceeded }: QuotaStatusProps) => {
  if (quotaExceeded) {
    return (
      <p className="text-destructive text-sm" role="alert" data-testid="quota-exceeded-message">
        You&apos;ve reached your free download limit. Purchase this release to continue downloading.
      </p>
    );
  }
  if (hasPurchased || remainingQuota === null) return null;
  return (
    <p className="text-xs text-zinc-950">
      {remainingQuota} free {remainingQuota === 1 ? 'download' : 'downloads'} remaining
    </p>
  );
};

interface FormatDownloadButtonProps {
  formatType: string;
  isDownloading: boolean;
  disabled: boolean;
  onDownload: (formatType: string) => void;
}

/** A single format's download button with a spinner while its download runs. */
const FormatDownloadButton = ({
  formatType,
  isDownloading,
  disabled,
  onDownload,
}: FormatDownloadButtonProps) => (
  <Button
    variant="outline"
    size="sm"
    className="w-full justify-start gap-2"
    disabled={disabled}
    onClick={() => onDownload(formatType)}
  >
    {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
    {getFormatLabel(formatType)}
  </Button>
);

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

  const { data: quotaData } = useDownloadQuotaQuery({ enabled: !hasPurchased });
  const remainingQuota = quotaData?.remainingQuota ?? null;
  const quotaExceeded = isQuotaExceeded(hasPurchased, releaseId, quotaData);

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
    return <p className="text-sm text-zinc-950">No digital formats available for download.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Choose a format:</p>
      <QuotaStatus
        hasPurchased={hasPurchased}
        remainingQuota={remainingQuota}
        quotaExceeded={quotaExceeded}
      />
      {formats.map(({ formatType }) => (
        <FormatDownloadButton
          key={formatType}
          formatType={formatType}
          isDownloading={downloadingFormat === formatType}
          disabled={downloadingFormat === formatType || quotaExceeded}
          onDownload={handleDownload}
        />
      ))}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
