/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FormatDownloadStatus, FormatProgress } from '@/components/format-progress-list';
import { FORMAT_LABELS } from '@/lib/constants/digital-formats';
import { parseSSEBuffer } from '@/lib/utils/parse-sse';
import { triggerDownload } from '@/lib/utils/trigger-download';

const FORMAT_LABEL_MAP = new Map(Object.entries(FORMAT_LABELS));

const getFormatLabel = (formatType: string): string =>
  FORMAT_LABEL_MAP.get(formatType) ?? formatType;

type DownloadPhase = 'idle' | 'downloading' | 'complete' | 'error';

type SetProgress = React.Dispatch<React.SetStateAction<FormatProgress[]>>;

/** Applies a single parsed SSE event to format progress state. Returns true when download is triggered. */
const applySSEEvent = (
  event: string,
  data: Record<string, unknown>,
  setProgress: SetProgress
): boolean => {
  if (event === 'progress') {
    const status = data.status as FormatDownloadStatus;
    if (data.formatType) {
      setProgress((prev) =>
        prev.map((fp) => (fp.formatType === data.formatType ? { ...fp, status } : fp))
      );
    } else if (status === 'uploading') {
      setProgress((prev) =>
        prev.map((fp) =>
          fp.status === 'pending' || fp.status === 'zipping'
            ? { ...fp, status: 'uploading' as const }
            : fp
        )
      );
    }
    return false;
  }
  if (event === 'ready') {
    triggerDownload(data.downloadUrl as string, data.fileName as string);
    setProgress((prev) =>
      prev.map((fp) => (fp.status !== 'error' ? { ...fp, status: 'complete' as const } : fp))
    );
    return true;
  }
  if (event === 'error' && data.formatType) {
    setProgress((prev) =>
      prev.map((fp) =>
        fp.formatType === data.formatType ? { ...fp, status: 'error' as const } : fp
      )
    );
  }
  return false;
};

/** Clears any pending reset timer then schedules a 3-second UI reset via the provided setters. */
const scheduleUIReset = (
  ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setPhase: React.Dispatch<React.SetStateAction<DownloadPhase>>,
  setProgress: SetProgress
): void => {
  if (ref.current) clearTimeout(ref.current);
  ref.current = setTimeout(() => {
    setPhase('idle');
    setProgress([]);
    ref.current = null;
  }, 3000);
};

/** Drains the SSE response body, dispatching progress updates. Calls `onReady` when a download is triggered. */
const drainSSEBody = async (
  body: ReadableStream<Uint8Array>,
  setProgress: SetProgress,
  onReady: () => void
): Promise<void> => {
  const reader = body.getReader();
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
      if (applySSEEvent(evt.event, data, setProgress)) onReady();
    }
  }
};

export interface UseCollectionDownloadReturn {
  downloadPhase: DownloadPhase;
  formatProgress: FormatProgress[];
  downloadError: string | null;
  isDownloading: boolean;
  handleDownload: (selectedFormats: string[]) => Promise<void>;
  resetDownloadState: () => void;
}

/**
 * Encapsulates the SSE-based bundle download flow for a single release.
 * Manages download phase, per-format progress, error state, and the
 * 3-second auto-reset timer after a successful download.
 */
export const useCollectionDownload = (releaseId: string): UseCollectionDownloadReturn => {
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>('idle');
  const [formatProgress, setFormatProgress] = useState<FormatProgress[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    },
    []
  );

  const resetDownloadState = useCallback(() => {
    setDownloadPhase('idle');
    setDownloadError(null);
    setFormatProgress([]);
  }, []);

  const handleDownload = useCallback(
    async (selectedFormats: string[]) => {
      if (selectedFormats.length === 0) return;

      const joined = selectedFormats.join(',');
      const apiUrl = `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=json`;

      setDownloadPhase('downloading');
      setDownloadError(null);
      setFormatProgress(
        selectedFormats.map((ft) => ({
          formatType: ft,
          label: getFormatLabel(ft),
          status: 'pending' as const,
        }))
      );

      let downloadTriggered = false;
      const onReady = () => {
        downloadTriggered = true;
      };
      try {
        const response = await fetch(apiUrl);
        if (!response.ok || !response.body) {
          setDownloadPhase('error');
          setFormatProgress([]);
          setDownloadError('Download failed. Please try again.');
          return;
        }
        await drainSSEBody(response.body, setFormatProgress, onReady);
        if (downloadTriggered) {
          setDownloadPhase('complete');
          scheduleUIReset(resetTimeoutRef, setDownloadPhase, setFormatProgress);
        } else {
          setDownloadPhase('error');
          setDownloadError('No formats could be prepared. Please try again.');
        }
      } catch {
        if (downloadTriggered) {
          setDownloadPhase('complete');
          scheduleUIReset(resetTimeoutRef, setDownloadPhase, setFormatProgress);
        } else {
          setDownloadPhase('error');
          setFormatProgress([]);
          setDownloadError('Something went wrong. Please try again.');
        }
      }
    },
    [releaseId]
  );

  return {
    downloadPhase,
    formatProgress,
    downloadError,
    isDownloading: downloadPhase === 'downloading',
    handleDownload,
    resetDownloadState,
  };
};
