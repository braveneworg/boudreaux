/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { FormatBundleDownload } from '@/app/components/format-bundle-download';
import { TimeRemaining } from '@/app/components/time-remaining';
import { Button } from '@/app/components/ui/button';
import {
  FORMAT_LABELS,
  FREE_FORMAT_TYPES,
  type FreeFormatType,
} from '@/lib/constants/digital-formats';

/**
 * Lookup map for format labels keyed by format type. Backed by a `Map` so
 * dynamic format-type keys are read without object-injection risk; falls back
 * to the raw format type when no label is registered.
 */
const FORMAT_LABEL_MAP = new Map(Object.entries(FORMAT_LABELS));
const getFormatLabel = (formatType: string): string =>
  FORMAT_LABEL_MAP.get(formatType) ?? formatType;

interface FreeFormatSelectStepProps {
  releaseId: string;
  /**
   * The subset of {@link FREE_FORMAT_TYPES} that are actually published for
   * this release. Sourced from `GET /api/releases/[id]/download/free-status`.
   */
  availableFreeFormats: ReadonlyArray<FreeFormatType>;
  /**
   * True while the `/free-status` query is still in flight. When true, the
   * component renders a loading indicator instead of the FR-015 “no free
   * formats available” empty state — otherwise visitors who click the Free
   * radio before the query resolves see a false-positive empty state.
   */
  isLoading?: boolean;
  /**
   * When set, the cap has been exhausted and the component renders a disabled
   * state with a live countdown to {@link capReachedResetsAtIso} plus a CTA to
   * the premium / sign-in path. Sourced from
   * `freeStatus.blockedReason === 'cap-reached'` and from `403 CAP_REACHED`
   * mid-attempt responses on the bundle endpoint.
   */
  capReachedResetsAtIso?: string | null;
  /**
   * Destination for the premium / sign-in CTA shown alongside the countdown.
   * Defaults to the Pay-What-You-Want purchase entry for the release.
   */
  premiumCtaHref?: string;
  onDownloadComplete?: () => void;
}

/**
 * Step rendered inside the download dialog when the user picks the free path.
 * Shows an instructional message and delegates the actual format picker +
 * SSE-driven progress UI to {@link FormatBundleDownload} in `'free'` mode so
 * the same proven streaming pipeline is reused — only the option set and the
 * `&mode=free` URL flag change.
 *
 * Feature: 007-free-digital-downloads (US1, US2 cap-reached, T038/T053).
 */
export const FreeFormatSelectStep = ({
  releaseId,
  availableFreeFormats,
  isLoading = false,
  capReachedResetsAtIso,
  premiumCtaHref,
  onDownloadComplete,
}: FreeFormatSelectStepProps) => {
  if (isLoading && availableFreeFormats.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-6"
        role="status"
        aria-live="polite"
        aria-label="Loading available formats"
      >
        <Loader2 className="text-zinc-950-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (availableFreeFormats.length === 0) {
    // Defensive empty-state per FR-015. The dialog should normally gate the
    // free radio when no free formats are published, but this guards against
    // race conditions between status fetch and dialog render.
    return (
      <p className="text-zinc-950-foreground text-sm" aria-live="polite">
        No free formats available for this release
      </p>
    );
  }

  if (capReachedResetsAtIso) {
    const ctaHref = premiumCtaHref ?? `/releases/${releaseId}#purchase`;
    return (
      <div className="space-y-4" data-testid="free-cap-reached">
        <p
          className="text-zinc-950-foreground text-sm font-semibold"
          aria-live="polite"
          id="free-cap-reached-title"
        >
          Download limit reached
        </p>
        <p className="text-zinc-950-foreground text-sm" id="free-cap-reached-description">
          You can download up to 3 free bundles of this release every 24 hours. Try again in{' '}
          <TimeRemaining resetsAtIso={capReachedResetsAtIso} id="free-cap-reached-countdown" />, or
          get instant access by paying what you want.
        </p>
        <Button
          type="button"
          disabled
          aria-describedby="free-cap-reached-countdown"
          className="w-full"
        >
          Download limit reached
        </Button>
        <Button asChild type="button" variant="default" className="w-full">
          <Link href={ctaHref}>Pay what you want</Link>
        </Button>
      </div>
    );
  }

  const availableFormats = availableFreeFormats.map((formatType) => ({
    formatType,
    fileName: getFormatLabel(formatType),
  }));

  return (
    <div className="space-y-4">
      <p className="text-zinc-950-foreground text-sm" aria-live="polite">
        Select one or both free formats to download.
      </p>
      <FormatBundleDownload
        mode="free"
        releaseId={releaseId}
        availableFormats={availableFormats}
        downloadCount={0}
        onDownloadComplete={onDownloadComplete}
      />
    </div>
  );
};

// Re-export to keep the existing public surface for type imports.
export type { FreeFormatType };
void FREE_FORMAT_TYPES;
