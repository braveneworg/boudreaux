/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMemo, useState } from 'react';

import { AlertCircle, CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

import { MultiCombobox } from '@/app/components/forms/fields/multi-combobox';
import { Button } from '@/app/components/ui/button';
import { useReleaseDigitalFormatsQuery } from '@/app/hooks/use-release-digital-formats-query';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';
import { parseSSEBuffer } from '@/lib/utils/parse-sse';
import { triggerDownload } from '@/lib/utils/trigger-download';

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

type FormatDownloadStatus = 'pending' | 'zipping' | 'done' | 'uploading' | 'complete' | 'error';

interface FormatProgress {
  formatType: string;
  label: string;
  status: FormatDownloadStatus;
}

/**
 * FormatBundleDownload — multi-select format picker that streams per-format
 * progress from the bundle API via SSE while a single combined ZIP is prepared
 * server-side. Once ready is emitted, the client triggers one download URL and
 * the server records download count/events.
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

  const handleDownload = async () => {
    if (!hasSelection || atLimit || isDownloading) return;

    const joined = selectedFormats.join(',');
    const apiUrl = `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=json`;

    setDownloadPhase('downloading');
    setDownloadError(null);

    // Initialize all selected formats as pending
    setFormatProgress(
      selectedFormats.map((ft) => ({
        formatType: ft,
        label: FORMAT_LABELS[ft] ?? ft,
        status: 'pending' as const,
      }))
    );

    let downloadTriggered = false;

    try {
      const response = await fetch(apiUrl);

      if (!response.ok || !response.body) {
        setDownloadPhase('error');
        setFormatProgress([]);
        setDownloadError('Download failed. Please try again.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEBuffer(buffer);
        buffer = remaining;

        for (const evt of events) {
          const data = JSON.parse(evt.data) as Record<string, unknown>;

          if (evt.event === 'progress') {
            const status = data.status as FormatDownloadStatus;

            if (data.formatType) {
              setFormatProgress((prev) =>
                prev.map((fp) => (fp.formatType === data.formatType ? { ...fp, status } : fp))
              );
            } else if (status === 'uploading') {
              setFormatProgress((prev) =>
                prev.map((fp) =>
                  fp.status !== 'error' ? { ...fp, status: 'uploading' as const } : fp
                )
              );
            }
          } else if (evt.event === 'ready') {
            await triggerDownload(data.downloadUrl as string, data.fileName as string);
            downloadTriggered = true;
            setFormatProgress((prev) =>
              prev.map((fp) =>
                fp.status !== 'error' ? { ...fp, status: 'complete' as const } : fp
              )
            );
          } else if (evt.event === 'error') {
            if (data.formatType) {
              setFormatProgress((prev) =>
                prev.map((fp) =>
                  fp.formatType === data.formatType ? { ...fp, status: 'error' as const } : fp
                )
              );
            }
          }
        }
      }

      if (downloadTriggered) {
        setDownloadPhase('complete');
        onDownloadComplete?.();

        setTimeout(() => {
          setDownloadPhase('idle');
          setFormatProgress([]);
        }, 3000);
      } else {
        setDownloadPhase('error');
        setDownloadError('No formats could be prepared. Please try again.');
      }
    } catch {
      // The anchor-based download may tear down the active SSE stream,
      // causing reader.read() to throw. If the download was already
      // triggered, treat it as success — the file is downloading.
      if (downloadTriggered) {
        setDownloadPhase('complete');
        onDownloadComplete?.();

        setTimeout(() => {
          setDownloadPhase('idle');
          setFormatProgress([]);
        }, 3000);
      } else {
        setDownloadPhase('error');
        setFormatProgress([]);
        setDownloadError('Something went wrong. Please try again.');
      }
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
              {fp.status === 'complete' || fp.status === 'done' ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : fp.status === 'zipping' || fp.status === 'uploading' ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
              ) : fp.status === 'error' ? (
                <AlertCircle className="text-destructive size-4 shrink-0" />
              ) : (
                <span className="text-muted-foreground size-4 shrink-0 text-center">&bull;</span>
              )}
              <span
                className={
                  fp.status === 'complete' || fp.status === 'done'
                    ? 'text-emerald-600'
                    : fp.status === 'error'
                      ? 'text-destructive'
                      : ''
                }
              >
                {fp.label}
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
          Download started!
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
              Preparing...
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
