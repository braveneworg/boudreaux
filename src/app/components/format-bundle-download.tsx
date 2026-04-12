/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

import { MultiCombobox } from '@/app/components/forms/fields/multi-combobox';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import { useReleaseDigitalFormatsQuery } from '@/app/hooks/use-release-digital-formats-query';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface FormatBundleDownloadProps {
  releaseId: string;
  releaseTitle: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadComplete?: () => void;
}

/** Format bytes into a human-readable string. */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * FormatBundleDownload — multi-select format picker with a bundle download
 * button. Uses a multi-select combobox for format selection and triggers a
 * ZIP download of all selected formats via the bundle API route.
 *
 * Downloads are streamed via fetch() so a real progress bar can track the
 * download. When the server provides Content-Length the bar is determinate;
 * otherwise it shows bytes received with an indeterminate animation.
 *
 * Fetches available formats from the API on mount to ensure fresh data,
 * falling back to the prop value.
 */
export const FormatBundleDownload = ({
  releaseId,
  releaseTitle,
  availableFormats: initialFormats,
  downloadCount,
  onDownloadComplete,
}: FormatBundleDownloadProps) => {
  const { isPending: isLoadingFormats, data: formatsData } = useReleaseDigitalFormatsQuery(
    releaseId,
    { enabled: initialFormats.length === 0 }
  );
  const formats = initialFormats.length > 0 ? initialFormats : (formatsData?.formats ?? null);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    received: number;
    total: number | null;
  } | null>(null);
  const [downloadDone, setDownloadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolvedFormats = formats ?? [];
  const isLoadingFormatsResolved = initialFormats.length > 0 ? false : isLoadingFormats;
  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;

  const comboboxOptions = useMemo(
    () =>
      (formats ?? []).map(({ formatType }) => ({
        value: formatType,
        label: FORMAT_LABELS[formatType] ?? formatType,
      })),
    [formats]
  );

  const handleDownload = useCallback(async () => {
    if (!hasSelection || atLimit) return;

    setIsDownloading(true);
    setDownloadProgress(null);
    setDownloadDone(false);
    setError(null);

    const joined = selectedFormats.join(',');
    const url = `/api/releases/${releaseId}/download/bundle?formats=${joined}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          (body as { message?: string } | null)?.message ?? 'Download failed. Please try again.';
        setError(message);
        setIsDownloading(false);
        return;
      }

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : null;

      const reader = response.body?.getReader();
      if (!reader) {
        setError('Download failed. Please try again.');
        setIsDownloading(false);
        return;
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setDownloadProgress({ received, total });
      }

      // Build blob and trigger browser save
      const blob = new Blob(chunks as unknown as Blob[], { type: 'application/zip' });
      const blobUrl = URL.createObjectURL(blob);
      const safeTitle = releaseTitle.replace(/[^\w\s.-]/g, '').trim() || 'release';
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${safeTitle}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);

      setDownloadDone(true);
      onDownloadComplete?.();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Download failed. Please try again.');
      }
    } finally {
      setIsDownloading(false);
      abortRef.current = null;
    }
  }, [hasSelection, atLimit, selectedFormats, releaseId, releaseTitle, onDownloadComplete]);

  // Abort in-flight download if component unmounts
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (isLoadingFormatsResolved) {
    return (
      <div className="flex items-center justify-center py-4" role="status">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  if (resolvedFormats.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    );
  }

  return (
    <div className="space-y-4">
      <MultiCombobox
        options={comboboxOptions}
        value={selectedFormats}
        onValueChange={setSelectedFormats}
        placeholder="Select formats..."
        emptyMessage="No formats found."
        disabled={atLimit}
      />

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {isDownloading && downloadProgress && (
        <div className="space-y-2" role="status" aria-label="Download progress">
          <Progress
            value={
              downloadProgress.total
                ? Math.round((downloadProgress.received / downloadProgress.total) * 100)
                : undefined
            }
            className={!downloadProgress.total ? 'animate-pulse' : undefined}
          />
          <p className="text-muted-foreground text-center text-xs">
            {downloadProgress.total
              ? `${formatBytes(downloadProgress.received)} of ${formatBytes(downloadProgress.total)}`
              : `${formatBytes(downloadProgress.received)} downloaded`}
          </p>
        </div>
      )}

      {downloadDone && !isDownloading && (
        <div className="flex items-center justify-center gap-2 py-2" role="status">
          <CheckCircle2 className="text-green-600 size-5" />
          <span className="text-sm font-medium">Download complete</span>
        </div>
      )}

      <Button
        className="w-full"
        type="button"
        disabled={!hasSelection || atLimit || isDownloading}
        onClick={handleDownload}
      >
        {isDownloading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <DownloadIcon className="size-4" />
            {hasSelection
              ? `Download ${selectedFormats.length} ${selectedFormats.length === 1 ? 'format' : 'formats'}`
              : 'Select at least one format'}
          </>
        )}
      </Button>
    </div>
  );
};
