/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { AlertCircle, CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

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

type FormatDownloadStatus = 'pending' | 'downloading' | 'complete';

interface FormatProgress {
  formatType: string;
  label: string;
  fileCount: number;
  filesCompleted: number;
  status: FormatDownloadStatus;
}

interface DownloadFile {
  downloadUrl: string;
  fileName: string;
}

interface DownloadEntry {
  formatType: string;
  label: string;
  files: DownloadFile[];
}

const DOWNLOAD_DELAY_MS = 500;

/**
 * FormatBundleDownload — multi-select format picker that fetches per-format
 * presigned S3 URLs from the bundle API (`respond=json`), then triggers each
 * download sequentially with `window.open(url, '_self')`. After all downloads
 * are triggered, a POST to the confirm endpoint increments the download count.
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
  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'downloading' | 'complete' | 'error'>(
    'idle'
  );
  const [formatProgress, setFormatProgress] = useState<FormatProgress[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const resolvedFormats = formats ?? [];
  const isLoadingFormatsResolved = initialFormats.length > 0 ? false : isLoadingFormats;
  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;
  const isDownloading = downloadPhase === 'downloading';

  const comboboxOptions = useMemo(
    () =>
      (formats ?? []).map(({ formatType }) => ({
        value: formatType,
        label: FORMAT_LABELS[formatType] ?? formatType,
      })),
    [formats]
  );

  const delay = useCallback(
    (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    []
  );

  const handleDownload = async () => {
    if (!hasSelection || atLimit || isDownloading) return;

    const joined = selectedFormats.join(',');
    const apiUrl = `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=json`;

    setDownloadPhase('downloading');
    setDownloadError(null);

    try {
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok || !data.success) {
        setDownloadPhase('error');
        setFormatProgress([]);
        setDownloadError(data.message ?? 'Download failed. Please try again.');
        return;
      }

      const downloads: DownloadEntry[] = data.downloads;

      // Initialize per-format progress
      setFormatProgress(
        downloads.map((d) => ({
          formatType: d.formatType,
          label: d.label,
          fileCount: d.files.length,
          filesCompleted: 0,
          status: 'pending',
        }))
      );

      // Trigger downloads sequentially with delays
      for (let i = 0; i < downloads.length; i++) {
        const entry = downloads[i];

        setFormatProgress((prev) =>
          prev.map((fp) =>
            fp.formatType === entry.formatType ? { ...fp, status: 'downloading' } : fp
          )
        );

        for (let j = 0; j < entry.files.length; j++) {
          window.open(entry.files[j].downloadUrl, '_self');
          if (j < entry.files.length - 1 || i < downloads.length - 1) {
            await delay(DOWNLOAD_DELAY_MS);
          }

          setFormatProgress((prev) =>
            prev.map((fp) =>
              fp.formatType === entry.formatType ? { ...fp, filesCompleted: j + 1 } : fp
            )
          );
        }

        setFormatProgress((prev) =>
          prev.map((fp) =>
            fp.formatType === entry.formatType ? { ...fp, status: 'complete' } : fp
          )
        );
      }

      // Confirm download — increments count once
      await fetch(`/api/releases/${releaseId}/download/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formats: downloads.map((d) => d.formatType) }),
      });

      setDownloadPhase('complete');
      onDownloadComplete?.();

      setTimeout(() => {
        setDownloadPhase('idle');
        setFormatProgress([]);
      }, 3000);
    } catch {
      setDownloadPhase('error');
      setFormatProgress([]);
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
        disabled={atLimit || isDownloading}
      />

      {formatProgress.length > 0 && (
        <ul className="space-y-1" role="status">
          {formatProgress.map((fp) => (
            <li key={fp.formatType} className="flex items-center gap-2 text-sm">
              {fp.status === 'complete' ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : fp.status === 'downloading' ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
              ) : (
                <span className="text-muted-foreground size-4 shrink-0 text-center">&bull;</span>
              )}
              <span className={fp.status === 'complete' ? 'text-emerald-600' : ''}>
                {fp.label}
                {fp.fileCount > 1 && fp.status === 'downloading'
                  ? ` (${fp.filesCompleted}/${fp.fileCount})`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
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
          Downloads started!
        </div>
      ) : (
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
      )}
    </div>
  );
};
