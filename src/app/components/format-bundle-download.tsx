/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { AlertCircle, CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

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
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadComplete?: () => void;
}

/**
 * FormatBundleDownload — multi-select format picker with a bundle download
 * button. Clicking the button fetches a presigned S3 URL via the bundle API
 * (with `respond=json`), then triggers the download with
 * `window.open(url, '_self')`. The response's `Content-Disposition: attachment`
 * header causes the browser to download the ZIP without leaving the page.
 *
 * A progress bar is shown while the bundle is being prepared on the server.
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
  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'preparing' | 'complete' | 'error'>(
    'idle'
  );
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const resolvedFormats = formats ?? [];
  const isLoadingFormatsResolved = initialFormats.length > 0 ? false : isLoadingFormats;
  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;
  const isPreparing = downloadPhase === 'preparing';

  const comboboxOptions = useMemo(
    () =>
      (formats ?? []).map(({ formatType }) => ({
        value: formatType,
        label: FORMAT_LABELS[formatType] ?? formatType,
      })),
    [formats]
  );

  const handleDownload = async () => {
    if (!hasSelection || atLimit || isPreparing) return;

    const joined = selectedFormats.join(',');
    const apiUrl = `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=json`;

    setDownloadPhase('preparing');
    setDownloadProgress(10);
    setDownloadError(null);
    const progressInterval = window.setInterval(() => {
      setDownloadProgress((value) => (value >= 90 ? value : value + 10));
    }, 300);

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      window.clearInterval(progressInterval);

      if (!response.ok || !data.success) {
        setDownloadPhase('error');
        setDownloadProgress(0);
        setDownloadError(data.message ?? 'Download failed. Please try again.');
        return;
      }

      window.open(data.downloadUrl, '_self');
      setDownloadPhase('complete');
      setDownloadProgress(100);
      onDownloadComplete?.();

      setTimeout(() => {
        setDownloadPhase('idle');
        setDownloadProgress(0);
      }, 2000);
    } catch {
      window.clearInterval(progressInterval);
      setDownloadPhase('error');
      setDownloadProgress(0);
      setDownloadError('Something went wrong. Please try again.');
    }
  };

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
        disabled={atLimit || isPreparing}
      />

      {(isPreparing || downloadPhase === 'complete') && (
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs">{downloadProgress}%</div>
          <Progress value={downloadProgress} className="h-2" />
        </div>
      )}

      {downloadPhase === 'error' && downloadError && (
        <div className="flex items-center gap-2 text-destructive text-sm" role="alert">
          <AlertCircle className="size-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {downloadPhase === 'complete' ? (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-emerald-600">
          <CheckCircle2 className="size-4" />
          Download started!
        </div>
      ) : (
        <Button
          className="w-full"
          type="button"
          disabled={!hasSelection || atLimit || isPreparing}
          onClick={handleDownload}
        >
          {isPreparing ? (
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
      )}
    </div>
  );
};
