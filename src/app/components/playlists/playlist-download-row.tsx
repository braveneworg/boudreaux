/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useState, type ReactElement } from 'react';

import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FREE_FORMAT_TYPES, type FreeFormatType } from '@/lib/constants/digital-formats';
import { triggerDownload } from '@/lib/utils/trigger-download';
import { playlistDownloadPreflightResponseSchema } from '@/lib/validation/playlist-schema';

interface PlaylistDownloadRowProps {
  playlistId: string;
  disabled?: boolean;
}

const FORMAT_BUTTON_LABELS = new Map<FreeFormatType, string>([
  ['MP3_320KBPS', 'MP3'],
  ['AAC', 'AAC'],
]);

const formatButtonLabel = (format: FreeFormatType): string =>
  FORMAT_BUTTON_LABELS.get(format) ?? format;

type PreflightOutcome = 'ok' | 'empty' | 'quota' | 'error';

const GENERIC_DOWNLOAD_ERROR_TOAST = 'Download failed. Please try again.';

/** Toast copy for the specific outcomes; 'error' falls back to the generic copy. */
const PREFLIGHT_ERROR_TOASTS = new Map<Exclude<PreflightOutcome, 'ok'>, string>([
  ['empty', 'This playlist has no downloadable tracks.'],
  ['quota', 'Free AAC download limit reached — MP3 is always free.'],
]);

const buildPlaylistDownloadUrl = (
  playlistId: string,
  format: FreeFormatType,
  preflight: boolean
): string => {
  const base = `/api/playlists/${encodeURIComponent(playlistId)}/download?format=${format}`;
  return preflight ? `${base}&respond=preflight` : base;
};

/**
 * Preflight the zip endpoint before anchor-navigating to it — without this a
 * 4xx response renders as a raw JSON page (same rationale as
 * format-bundle-download.tsx). The body is parsed with Task 4's
 * `playlistDownloadPreflightResponseSchema`, so `ok: true` with
 * `trackCount: 0` (all-video/empty playlist) is caught HERE — the stream
 * would 404 NO_TRACKS — and the quota discriminant is type-checked.
 */
const runDownloadPreflight = async (
  playlistId: string,
  format: FreeFormatType
): Promise<PreflightOutcome> => {
  try {
    const response = await fetch(buildPlaylistDownloadUrl(playlistId, format, true), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const body: unknown = await response.json().catch(() => null);
    const parsed = playlistDownloadPreflightResponseSchema.safeParse(body);
    if (response.ok && parsed.success && parsed.data.ok) {
      return parsed.data.trackCount > 0 ? 'ok' : 'empty';
    }
    if (response.status === 403 && parsed.success && !parsed.data.ok) {
      return 'quota';
    }
    return 'error';
  } catch {
    return 'error';
  }
};

/**
 * Download row shown above the playlist player: a popover offering the two
 * free formats. MP3 streams unsigned; AAC counts against the freemium quota —
 * a quota 403 degrades to a toast steering the user to MP3. Videos are never
 * bundled (server-side skip; the muted line sets expectations).
 */
export const PlaylistDownloadRow = ({
  playlistId,
  disabled,
}: PlaylistDownloadRowProps): ReactElement => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inFlightFormat, setInFlightFormat] = useState<FreeFormatType | null>(null);

  const handleFormatChoice = async (format: FreeFormatType): Promise<void> => {
    setInFlightFormat(format);
    const outcome = await runDownloadPreflight(playlistId, format);
    setInFlightFormat(null);
    if (outcome === 'ok') {
      triggerDownload(buildPlaylistDownloadUrl(playlistId, format, false));
      setPopoverOpen(false);
      return;
    }
    toast.error(PREFLIGHT_ERROR_TOASTS.get(outcome) ?? GENERIC_DOWNLOAD_ERROR_TOAST);
  };

  return (
    <div className="flex items-center justify-end">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Download playlist"
          >
            <Download aria-hidden="true" />
            Download
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56">
          <div className="flex flex-col gap-2">
            {FREE_FORMAT_TYPES.map((format) => (
              <Button
                key={format}
                type="button"
                variant="outline"
                disabled={inFlightFormat !== null}
                aria-label={`Download ${formatButtonLabel(format)}`}
                onClick={() => {
                  void handleFormatChoice(format);
                }}
              >
                {inFlightFormat === format && (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                )}
                {formatButtonLabel(format)}
              </Button>
            ))}
            <p className="text-xs text-zinc-500">Videos are skipped in downloads</p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
