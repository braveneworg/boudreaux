/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import { useWatch, type Control } from 'react-hook-form';

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
  /**
   * Resolves the suggestion server-side (marks it applied) so it cannot
   * re-apply over the admin's date on a later visit — see the hook JSDoc.
   */
  onResolve: (suggestionId: string) => void;
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
 * Fills an EMPTY release date from the enrichment's suggestion as soon as it
 * appears — a date nobody has set yet should be used without a manual click.
 * The guard is emptiness, not dirtiness: a date already in the form (typed,
 * found by the automatic lookup, or loaded from the row) is never overwritten
 * — the found date stays, and the suggestion remains a pending card with
 * "Use this date" for the admin to choose. Each suggestion fills at most once
 * per mount, so a later clear is never re-filled by a status poll. The fill is
 * ALSO resolved server-side via `onResolve` (marks the suggestion applied,
 * resolve-only — the form autosaves the value itself): the in-session guard
 * resets on every mount, and a suggestion left `pending` would re-fill an
 * emptied field on every later visit. A failed resolve degrades to exactly
 * that for one more visit; the client fill stands either way.
 */
export const useAutoApplyReleaseDateSuggestion = ({
  suggestions,
  control,
  onApply,
  onResolve,
}: UseAutoApplyReleaseDateSuggestionArgs): void => {
  const releasedOn = useWatch({ control, name: 'releasedOn' });
  const isEmpty = !releasedOn;
  const appliedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const suggestion = findReleaseDateSuggestion(suggestions);
    if (!suggestion || appliedIds.current.has(suggestion.id)) return;
    if (!isEmpty) return;
    appliedIds.current.add(suggestion.id);
    onApply('releasedOn', suggestion.value);
    onResolve(suggestion.id);
  }, [suggestions, isEmpty, onApply, onResolve]);
};
