/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useWatch } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { SuggestionFieldRow } from './suggestion-field-row';

import type { Control } from 'react-hook-form';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface VideoReleaseDateSuggestionProps {
  /** The video-level `releasedOn` suggestion (artistId null). */
  suggestion: EnrichmentSuggestion;
  control: Control<VideoFormData>;
  /** The form field the suggestion applies into (locked to `releasedOn`). */
  name: 'releasedOn';
  /** Applies the value into the RHF form (`setValue` in the parent — dirty + validate). */
  onApplyReleaseDate: (value: string) => void;
  /** Dismisses the suggestion server-side (dismiss IS allowed for releasedOn). */
  onDismiss: () => void;
  isBusy: boolean;
}

/**
 * The release-date suggestion. Apply writes the value into the mounted RHF
 * form via {@link onApplyReleaseDate} and NEVER calls the apply action —
 * the server rejects `op: 'apply'` for `releasedOn`, because any server write
 * would refetch `videos.detail` and reset the dirty form. The row therefore
 * derives its applied state from the live form value (via `useWatch`) and
 * shows a "Save to persist" hint until the admin saves.
 */
export const VideoReleaseDateSuggestion = ({
  suggestion,
  control,
  name,
  onApplyReleaseDate,
  onDismiss,
  isBusy,
}: VideoReleaseDateSuggestionProps): React.ReactElement => {
  const currentFormValue = useWatch({ control, name });
  const isAppliedToForm = currentFormValue === suggestion.value;
  const displayed: EnrichmentSuggestion =
    isAppliedToForm && suggestion.status === 'pending'
      ? { ...suggestion, status: 'applied' }
      : suggestion;

  return (
    <div data-testid="video-release-date-suggestion" className="space-y-2">
      <ul>
        <SuggestionFieldRow
          suggestion={displayed}
          currentValue={currentFormValue || null}
          isBusy={isBusy}
          applyLabel="Use this date"
          onApply={() => onApplyReleaseDate(suggestion.value)}
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
