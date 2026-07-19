/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { AlertCircle, CheckCircle2, DownloadIcon, Loader2 } from 'lucide-react';

import { MultiCombobox } from '@/app/components/forms/fields/multi-combobox';
import { Button } from '@/app/components/ui/button';
import { useReleaseDigitalFormatsQuery } from '@/hooks/use-release-digital-formats-query';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import {
  FORMAT_LABELS,
  FREE_FORMAT_TYPES,
  type FreeFormatType,
} from '@/lib/constants/digital-formats';
import { triggerDownload } from '@/lib/utils/trigger-download';

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

/**
 * Extract a user-facing error message from a failed bundle preflight response.
 * Falls back to a generic message when the body is missing or not JSON (e.g. a
 * 4xx that would otherwise render as a raw JSON page).
 */
const parsePreflightErrorMessage = async (preflight: Response): Promise<string> => {
  const fallback = 'Download failed. Please try again.';
  try {
    const body = (await preflight.json()) as { message?: string };
    if (typeof body?.message === 'string' && body.message.length > 0) {
      return body.message;
    }
  } catch {
    // Body was not JSON; fall back to default message.
  }
  return fallback;
};

/**
 * Resolve the format list to render from: caller-provided `initialFormats` when
 * present, otherwise the formats fetched via TanStack Query (or `null` while
 * loading / unavailable).
 */
const resolveFormats = (
  initialFormats: AvailableFormat[],
  fetchedFormats: AvailableFormat[] | undefined
): AvailableFormat[] | null =>
  initialFormats.length > 0 ? initialFormats : (fetchedFormats ?? null);

/** The query params that select the bundle endpoint flow (paid vs. free). */
interface BundleDownloadUrls {
  streamUrl: string;
  preflightUrl: string;
}

/**
 * Build the streaming + preflight bundle URLs for the selected formats and mode.
 * `free` mode appends `&mode=free`; both responses negotiate
 * `Content-Disposition: attachment` natively.
 */
const buildBundleDownloadUrls = (
  releaseId: string,
  selectedFormats: string[],
  mode: 'paid' | 'free'
): BundleDownloadUrls => {
  const joined = selectedFormats.join(',');
  const modeQuery = mode === 'free' ? '&mode=free' : '';
  return {
    streamUrl: `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=stream${modeQuery}`,
    preflightUrl: `/api/releases/${releaseId}/download/bundle?formats=${joined}&respond=preflight${modeQuery}`,
  };
};

interface FormatBundleDownloadProps {
  releaseId: string;
  availableFormats: AvailableFormat[];
  downloadCount: number;
  onDownloadComplete?: () => void;
  /**
   * Pre-selected formats. When combined with `autoStart`, the bundle download
   * is initiated automatically on mount with these formats and the picker is
   * hidden (used by the free-download flow).
   */
  initialSelectedFormats?: string[];
  /** Auto-trigger the bundle download on mount. Requires `initialSelectedFormats`. */
  autoStart?: boolean;
  /**
   * Selects which bundle endpoint flow to use. `'paid'` (default) requires a
   * verified purchase server-side. `'free'` (feature 007) restricts the
   * available format options to {@link FREE_FORMAT_TYPES}, appends
   * `&mode=free` to the bundle URL, and is gated by the per-visitor cap.
   */
  mode?: 'paid' | 'free';
}

// This component streams progress for the JSON `respond=json` bundle flow,
// which only ever surfaces two terminal states: `uploading` while the server
// zips/uploads, and `complete` after the download URL is delivered. The
// SSE-era `pending`/`zipping`/`done`/`error` states are exclusive to
// `collection-list.tsx`, where the full SSE flow remains in use.
type FormatDownloadStatus = 'uploading' | 'complete';

interface FormatProgress {
  formatType: string;
  label: string;
  status: FormatDownloadStatus;
}

/** Per-format progress list shown while the bundle ZIP is prepared/streamed. */
const BundleProgressList = ({ formatProgress }: { formatProgress: FormatProgress[] }) => {
  if (formatProgress.length === 0) return null;
  return (
    <ul className="space-y-1" role="status">
      {formatProgress.map((fp) => {
        const isComplete = fp.status === 'complete';
        return (
          <li key={fp.formatType} className="flex items-center gap-2 text-sm">
            {isComplete ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
              <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
            )}
            <span className={isComplete ? 'text-emerald-600' : ''}>{fp.label}</span>
          </li>
        );
      })}
    </ul>
  );
};

interface BundleCompleteStateProps {
  readyUrl: string | null;
  readyFileName: string | null;
}

/** Success state: confirmation plus an iOS/Safari anchor fallback when a URL is ready. */
const BundleCompleteState = ({ readyUrl, readyFileName }: BundleCompleteStateProps) => (
  <div className="flex flex-col items-center gap-2 py-2 text-sm">
    <div className="flex items-center gap-2 text-emerald-600">
      <CheckCircle2 className="size-4" />
      Download started!
    </div>
    {readyUrl && (
      // Visible anchor fallback for iOS/Safari, where the programmatic
      // anchor click after async SSE streaming may be suppressed because
      // the original user gesture has expired. Tapping this link is a
      // fresh user gesture and will always download.
      <a
        href={readyUrl}
        download={readyFileName ?? undefined}
        rel="noopener"
        className="text-primary text-xs underline"
      >
        Download didn&apos;t start? Tap here.
      </a>
    )}
  </div>
);

interface BundleDownloadButtonProps {
  hasSelection: boolean;
  atLimit: boolean;
  isDownloading: boolean;
  selectedCount: number;
  onClick: () => void;
}

/** The primary download button with selecting/preparing/ready label states. */
const BundleDownloadButton = ({
  hasSelection,
  atLimit,
  isDownloading,
  selectedCount,
  onClick,
}: BundleDownloadButtonProps) => (
  <Button
    className="w-full"
    type="button"
    disabled={!hasSelection || atLimit || isDownloading}
    onClick={onClick}
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
          ? `Download ${selectedCount} ${selectedCount === 1 ? 'format' : 'formats'}`
          : 'Select at least one format'}
      </>
    )}
  </Button>
);

interface BundleDownloadActionProps {
  downloadPhase: 'idle' | 'downloading' | 'complete' | 'error';
  autoStart: boolean;
  readyUrl: string | null;
  readyFileName: string | null;
  hasSelection: boolean;
  atLimit: boolean;
  isDownloading: boolean;
  selectedCount: number;
  onDownload: () => void;
}

/**
 * Footer slot: shows the success state once complete, hides itself during the
 * auto-start flow, and otherwise renders the {@link BundleDownloadButton}.
 */
const BundleDownloadAction = ({
  downloadPhase,
  autoStart,
  readyUrl,
  readyFileName,
  hasSelection,
  atLimit,
  isDownloading,
  selectedCount,
  onDownload,
}: BundleDownloadActionProps) => {
  if (downloadPhase === 'complete') {
    return <BundleCompleteState readyUrl={readyUrl} readyFileName={readyFileName} />;
  }
  if (autoStart) return null;
  return (
    <BundleDownloadButton
      hasSelection={hasSelection}
      atLimit={atLimit}
      isDownloading={isDownloading}
      selectedCount={selectedCount}
      onClick={onDownload}
    />
  );
};

interface ComboboxOption {
  value: string;
  label: string;
}

interface BundleDownloadContentProps {
  autoStart: boolean;
  isDownloading: boolean;
  comboboxOptions: ComboboxOption[];
  selectedFormats: string[];
  setSelectedFormats: (formats: string[]) => void;
  atLimit: boolean;
  formatProgress: FormatProgress[];
  downloadPhase: 'idle' | 'downloading' | 'complete' | 'error';
  downloadError: string | null;
  readyUrl: string | null;
  readyFileName: string | null;
  hasSelection: boolean;
  onDownload: () => void;
}

/**
 * The resolved content of {@link FormatBundleDownload}: the format picker (or an
 * auto-start "preparing" message), per-format progress, error message, and the
 * download action/success footer.
 */
const BundleDownloadContent = ({
  autoStart,
  isDownloading,
  comboboxOptions,
  selectedFormats,
  setSelectedFormats,
  atLimit,
  formatProgress,
  downloadPhase,
  downloadError,
  readyUrl,
  readyFileName,
  hasSelection,
  onDownload,
}: BundleDownloadContentProps) => (
  <div className="space-y-4">
    {!autoStart && (
      <MultiCombobox
        options={comboboxOptions}
        value={selectedFormats}
        onValueChange={setSelectedFormats}
        placeholder="Select formats..."
        emptyMessage="No formats found."
        disabled={atLimit || isDownloading}
      />
    )}

    {autoStart && isDownloading && (
      <p className="flex items-center gap-2 text-sm text-zinc-950">
        <Loader2 className="size-4 animate-spin" />
        Preparing your download...
      </p>
    )}

    <BundleProgressList formatProgress={formatProgress} />

    {downloadPhase === 'error' && downloadError && (
      <div className="text-destructive flex items-center gap-2 text-sm" role="alert">
        <AlertCircle className="size-4 shrink-0" />
        <span>{downloadError}</span>
      </div>
    )}

    <BundleDownloadAction
      downloadPhase={downloadPhase}
      autoStart={autoStart}
      readyUrl={readyUrl}
      readyFileName={readyFileName}
      hasSelection={hasSelection}
      atLimit={atLimit}
      isDownloading={isDownloading}
      selectedCount={selectedFormats.length}
      onDownload={onDownload}
    />
  </div>
);

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
  initialSelectedFormats,
  autoStart = false,
  mode = 'paid',
}: FormatBundleDownloadProps) => {
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoStartRef = useRef(false);
  // Holds the latest `handleDownload` closure so the mount auto-start effect can
  // invoke it without listing it as a dependency (it is recreated every render).
  // The effect stays gated on the auto-start conditions, not on this function.
  const handleDownloadRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const { isPending: isLoadingFormats, data: formatsData } = useReleaseDigitalFormatsQuery(
    releaseId,
    { enabled: initialFormats.length === 0 }
  );
  const formats = resolveFormats(initialFormats, formatsData?.formats);
  const filteredFormats = useMemo(() => {
    if (mode !== 'free' || !formats) return formats;
    const freeSet = new Set<string>(FREE_FORMAT_TYPES as ReadonlyArray<FreeFormatType>);
    return formats.filter((f) => freeSet.has(f.formatType));
  }, [formats, mode]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(() => {
    if (!initialSelectedFormats || initialFormats.length === 0) return [];
    const available = new Set(initialFormats.map((f) => f.formatType));
    return initialSelectedFormats.filter((ft) => available.has(ft));
  });
  const [downloadPhase, setDownloadPhase] = useState<'idle' | 'downloading' | 'complete' | 'error'>(
    'idle'
  );
  const [formatProgress, setFormatProgress] = useState<FormatProgress[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Captured ready URL so iOS/Safari users have a visible anchor fallback if
  // the programmatic anchor click was suppressed (gesture context lost during
  // the async SSE stream).
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const [readyFileName, setReadyFileName] = useState<string | null>(null);

  const resolvedFormats = filteredFormats ?? [];
  const isLoadingFormatsResolved = initialFormats.length > 0 ? false : isLoadingFormats;
  const atLimit = downloadCount >= MAX_RELEASE_DOWNLOAD_COUNT;
  const hasSelection = selectedFormats.length > 0;
  const isDownloading = downloadPhase === 'downloading';

  const comboboxOptions = useMemo(
    () =>
      (filteredFormats ?? []).map(({ formatType }) => ({
        value: formatType,
        label: getFormatLabel(formatType),
      })),
    [filteredFormats]
  );

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const scheduleReset = () => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    resetTimeoutRef.current = setTimeout(() => {
      setDownloadPhase('idle');
      setFormatProgress([]);
      setReadyUrl(null);
      setReadyFileName(null);
      resetTimeoutRef.current = null;
    }, 3000);
  };

  // Auto-start the download on mount when caller pre-selected formats and
  // requested autoStart (free-download flow). Guarded by a ref so React
  // strict-mode double-invocation does not fire two requests.
  useEffect(() => {
    if (!autoStart || autoStartRef.current) return;
    if (resolvedFormats.length === 0) return;
    if (selectedFormats.length === 0) return;
    autoStartRef.current = true;
    void handleDownloadRef.current();
  }, [autoStart, resolvedFormats.length, selectedFormats.length]);

  const handleDownload = async (): Promise<void> => {
    if (!hasSelection || atLimit || isDownloading) return;

    // Stream the ZIP directly from the server for both paid and free
    // flows. The browser negotiates `Content-Disposition: attachment`
    // natively, so anchor navigation to the streaming URL starts the
    // download as soon as the first byte arrives — no S3 multipart-upload
    // round-trip on the critical path. Per-format progress is sacrificed
    // for speed; the browser's native download UI takes over.
    const { streamUrl, preflightUrl } = buildBundleDownloadUrls(releaseId, selectedFormats, mode);

    setDownloadPhase('downloading');
    setDownloadError(null);
    setFormatProgress(
      selectedFormats.map((ft) => ({
        formatType: ft,
        label: getFormatLabel(ft),
        status: 'uploading' as const,
      }))
    );

    try {
      // Preflight: confirm auth/purchase/free-cap before anchor-navigating
      // to the streaming endpoint. Without this, a 4xx response is
      // rendered by the browser as a raw JSON page (e.g. "Download limit
      // reached", "Free download limit reached for this release").
      const preflight = await fetch(preflightUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      if (!preflight.ok) {
        setDownloadPhase('error');
        setFormatProgress([]);
        setDownloadError(await parsePreflightErrorMessage(preflight));
        return;
      }

      triggerDownload(streamUrl);
      setReadyUrl(streamUrl);
      setReadyFileName(null);
      setFormatProgress((prev) => prev.map((fp) => ({ ...fp, status: 'complete' as const })));
      setDownloadPhase('complete');
      onDownloadComplete?.();
      scheduleReset();
    } catch {
      setDownloadPhase('error');
      setFormatProgress([]);
      setDownloadError('Something went wrong. Please try again.');
    }
  };
  handleDownloadRef.current = handleDownload;

  if (isLoadingFormatsResolved) {
    return (
      <div className="flex items-center justify-center py-4" role="status">
        <Loader2 className="size-5 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (resolvedFormats.length === 0) {
    return <p className="text-sm text-zinc-950">No digital formats available for download.</p>;
  }

  return (
    <BundleDownloadContent
      autoStart={autoStart}
      isDownloading={isDownloading}
      comboboxOptions={comboboxOptions}
      selectedFormats={selectedFormats}
      setSelectedFormats={setSelectedFormats}
      atLimit={atLimit}
      formatProgress={formatProgress}
      downloadPhase={downloadPhase}
      downloadError={downloadError}
      readyUrl={readyUrl}
      readyFileName={readyFileName}
      hasSelection={hasSelection}
      onDownload={handleDownload}
    />
  );
};
