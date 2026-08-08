/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import { useFormState, useWatch, type Control } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type {
  VideoEnrichmentStatusResult,
  VideoLevelSuggestionField,
} from '@/lib/validation/video-enrichment-schema';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

interface UseAutofillAppliedDescriptionArgs {
  /** All suggestions from the current enrichment status payload. */
  suggestions: EnrichmentSuggestion[];
  control: Control<VideoFormData>;
  /** The parent form-writer (writes the value into the mounted RHF form). */
  onApply: (field: VideoLevelSuggestionField, value: string) => void;
}

/** The APPLIED video-level description suggestion (or undefined). */
export const findAppliedDescriptionSuggestion = (
  suggestions: EnrichmentSuggestion[]
): EnrichmentSuggestion | undefined =>
  suggestions.find(
    (suggestion) =>
      suggestion.artistId === null &&
      suggestion.field === 'description' &&
      suggestion.status === 'applied'
  );

/**
 * Mirrors the auto-applied description into a form that was open while
 * enrichment completed: the server writes the synthesized prose onto a
 * blank-description video (see `takeAutoApplyDescription`), but a form
 * mounted before that write still holds '' — and saving it would wipe the
 * applied text. Fills ONLY a blank, untouched field (a dirty or non-blank
 * description always wins), at most once per suggestion, and never resolves
 * anything server-side — the row is already `applied`. Pending suggestions
 * are untouched; their review stays manual.
 */
export const useAutofillAppliedDescription = ({
  suggestions,
  control,
  onApply,
}: UseAutofillAppliedDescriptionArgs): void => {
  const { dirtyFields } = useFormState({ control, name: 'description' });
  const description = useWatch({ control, name: 'description' });
  const filledIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const suggestion = findAppliedDescriptionSuggestion(suggestions);
    if (!suggestion || filledIds.current.has(suggestion.id)) return;
    if (dirtyFields.description || (description ?? '').trim()) return;
    filledIds.current.add(suggestion.id);
    onApply('description', suggestion.value);
  }, [suggestions, dirtyFields.description, description, onApply]);
};
