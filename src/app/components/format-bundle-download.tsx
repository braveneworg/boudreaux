/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

import { MultiCombobox } from '@/app/components/forms/fields/multi-combobox';
import { Button } from '@/app/components/ui/button';
import { useReleaseDigitalFormatsQuery } from '@/app/hooks/use-release-digital-formats-query';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';

interface AvailableFormat {
  formatType: string;
  fileName: string;
}

interface FormatBundleDownloadProps {
  releaseId: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadComplete?: () => void;
}

/**
 * FormatBundleDownload — multi-select format picker with a bundle download
 * button. Uses a multi-select combobox for format selection and triggers a
 * ZIP download of all selected formats via the bundle API route.
 *
 * The server builds the ZIP and uploads it to S3, then returns a presigned
 * download URL. The client opens the URL via window.open to trigger the
 * browser's native download — this works reliably on all platforms including
 * iOS Safari, which silently ignores blob: URL downloads.
 *
 * Fetches available formats from the API on mount to ensure fresh data,
 * falling back to the prop value.
 */
export const FormatBundleDownload = ({
  releaseId,
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
    setDownloadDone(false);
    setError(null);

    const joined = selectedFormats.join(',');
    const url = `/api/releases/${releaseId}/download/bundle?formats=${joined}`;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        downloadUrl?: string;
        message?: string;
      } | null;

      if (!response.ok || !data?.success) {
        setError(data?.message ?? 'Download failed. Please try again.');
        return;
      }

      if (!data.downloadUrl) {
        setError('Download link is unavailable. Please try again.');
        return;
      }

      // Use window.open for reliable downloads on all platforms
      // (iOS Safari ignores the download attribute on programmatic anchors).
      window.open(data.downloadUrl, '_self');

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
  }, [hasSelection, atLimit, selectedFormats, releaseId, onDownloadComplete]);

  // Abort in-flight request if component unmounts
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
            Preparing download...
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
