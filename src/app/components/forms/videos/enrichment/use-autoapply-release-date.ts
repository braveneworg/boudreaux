/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import { useFormState, type Control } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type {
  VideoEnrichmentStatusResult,
  VideoLevelSuggestionField,
} from '@/lib/validation/video-enrichment-schema';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface UseAutoApplyReleaseDateSuggestionArgs {
  /** All suggestions from the current enrichment status payload. */
  suggestions: EnrichmentSuggestion[];
  control: Control<VideoFormData>;
  /** The parent form-writer (writes the value into the mounted RHF form). */
  onApply: (field: VideoLevelSuggestionField, value: string) => void;
}

/** The one still-pending, video-level release-date suggestion (or undefined). */
export const findReleaseDateSuggestion = (
  suggestions: EnrichmentSuggestion[]
): EnrichmentSuggestion | undefined =>
  suggestions.find(
    (suggestion) =>
      suggestion.artistId === null &&
      suggestion.field === 'releasedOn' &&
      suggestion.status === 'pending'
  );

/**
 * Auto-applies the enrichment's release-date suggestion into the form as soon
 * as it appears — the corrected date the run fetched should be used without a
 * manual click. Guarded two ways: it never overwrites a date the admin has
 * hand-edited (a dirty `releasedOn`), and it applies each suggestion at most
 * once, so a later manual change is never re-clobbered by a status poll.
 */
export const useAutoApplyReleaseDateSuggestion = ({
  suggestions,
  control,
  onApply,
}: UseAutoApplyReleaseDateSuggestionArgs): void => {
  const { dirtyFields } = useFormState({ control, name: 'releasedOn' });
  const appliedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const suggestion = findReleaseDateSuggestion(suggestions);
    if (!suggestion || appliedIds.current.has(suggestion.id)) return;
    if (dirtyFields.releasedOn) return;
    appliedIds.current.add(suggestion.id);
    onApply('releasedOn', suggestion.value);
  }, [suggestions, dirtyFields.releasedOn, onApply]);
};
