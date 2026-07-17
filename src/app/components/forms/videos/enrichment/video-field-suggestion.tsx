/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { SuggestionFieldRow } from './suggestion-field-row';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface VideoFieldSuggestionProps {
  /** A video-level suggestion (releasedOn/description/featuredArtist — artistId null). */
  suggestion: EnrichmentSuggestion;
  /** The live form value the suggestion targets (null → shown as '—'). */
  currentValue: string | null;
  /** True once the form already holds this suggestion's value (derived by the parent). */
  isAppliedToForm: boolean;
  /** Visible Apply button text, per field (e.g. 'Use this date'). */
  applyLabel: string;
  /** Container test id — the release-date card keeps `video-release-date-suggestion` for E2E. */
  testId: string;
  /** Writes the value into the mounted RHF form via the parent (never a server apply). */
  onApply: () => void;
  /** Dismisses the suggestion server-side (dismiss IS allowed for video-level fields). */
  onDismiss: () => void;
  isBusy: boolean;
}

/**
 * One video-level suggestion (releasedOn/description/featuredArtist). Apply
 * writes into the mounted RHF form via the parent and NEVER calls the apply
 * action — the server rejects video-level applies because a `videos.detail`
 * refetch would wipe dirty edits. Applied state derives from the live form.
 */
export const VideoFieldSuggestion = ({
  suggestion,
  currentValue,
  isAppliedToForm,
  applyLabel,
  testId,
  onApply,
  onDismiss,
  isBusy,
}: VideoFieldSuggestionProps): React.ReactElement => {
  const displayed: EnrichmentSuggestion =
    isAppliedToForm && suggestion.status === 'pending'
      ? { ...suggestion, status: 'applied' }
      : suggestion;

  return (
    <div data-testid={testId} className="space-y-2">
      <ul>
        <SuggestionFieldRow
          suggestion={displayed}
          currentValue={currentValue}
          isBusy={isBusy}
          applyLabel={applyLabel}
          onApply={onApply}
          onDismiss={onDismiss}
        />
      </ul>
      {isAppliedToForm ? (
        <p role="status" className="text-sm text-zinc-700">
          Applied to the form — Save to persist.
        </p>
      ) : null}
    </div>
  );
};
