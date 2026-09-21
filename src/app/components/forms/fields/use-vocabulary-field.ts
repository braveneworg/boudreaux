/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import { useController } from 'react-hook-form';

import type { ArtistFormData } from '@/lib/validation/create-artist-schema';
import { splitList } from '@/utils/split-list';
import { normalizeVocabularyTerm } from '@/utils/vocabulary-term';

import type { Control } from 'react-hook-form';

/** The artist form fields this bridge can edit. */
export type VocabularyFieldName = 'genres' | 'tags';

interface UseVocabularyFieldArgs {
  control: Control<ArtistFormData>;
  name: VocabularyFieldName;
}

export interface VocabularyField {
  /** The current terms, normalised and deduped. */
  terms: string[];
  /** Replace the whole list; writes the comma-joined string back to the form. */
  setTerms: (next: string[]) => void;
}

/**
 * Bridges a comma-joined form string to the `string[]` the pill editor speaks.
 *
 * Built on `useController`, NOT `useWatch` + `setValue`, because the field has
 * to be REGISTERED. Genres and tags used to be registered by a `<TextField>`'s
 * Controller; the pill editor replaced it, and an unregistered field silently
 * breaks `resetField` — which is how `useApplyGeneratedBio` returns the form to
 * pristine after adopting content the job already saved. Without registration
 * the form stayed dirty after every generation and Save never disabled.
 *
 * `useController` also keeps `dirtyFields` honest, which is what the adoption
 * guard reads to avoid overwriting pills an admin is mid-edit on.
 *
 * The form value stays the single source of truth: terms are derived in a
 * `useMemo` and written back only from event handlers, never an effect, so
 * there is no render cycle.
 *
 * @param control - The artist form's control.
 * @param name - Which vocabulary field to bridge.
 * @returns The current terms and a setter that replaces them.
 */
export const useVocabularyField = ({ control, name }: UseVocabularyFieldArgs): VocabularyField => {
  const { field } = useController({ control, name });
  const { onChange } = field;
  const raw = field.value ?? '';

  const terms = useMemo(
    () => [...new Set(splitList(raw).map(normalizeVocabularyTerm).filter(Boolean))],
    [raw]
  );

  const setTerms = useCallback(
    (next: string[]): void => {
      const normalized = [...new Set(next.map(normalizeVocabularyTerm).filter(Boolean))];
      onChange(normalized.join(','));
    },
    [onChange]
  );

  return { terms, setTerms };
};
