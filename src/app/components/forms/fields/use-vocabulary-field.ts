/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo } from 'react';

import { useWatch } from 'react-hook-form';

import type { ArtistFormData } from '@/lib/validation/create-artist-schema';
import { splitList } from '@/utils/split-list';
import { normalizeVocabularyTerm } from '@/utils/vocabulary-term';

import type { Control, UseFormSetValue } from 'react-hook-form';

/** The artist form fields this bridge can edit. */
export type VocabularyFieldName = 'genres' | 'tags';

interface UseVocabularyFieldArgs {
  control: Control<ArtistFormData>;
  setValue: UseFormSetValue<ArtistFormData>;
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
 * The form value stays the single source of truth: this derives the array in a
 * `useMemo` and writes back only from event handlers, never in an effect, so
 * there is no render cycle.
 *
 * `useWatch` is called WITHOUT `defaultValue` — passing one returns the
 * placeholder rather than the value `useForm({ defaultValues })` seeded, so an
 * edit form would open with no pills (see
 * `docs/lessons/react-nextjs/usewatch-defaultvalue-masks-form-defaults.md`).
 *
 * @param control - The artist form's control.
 * @param setValue - The artist form's setValue.
 * @param name - Which vocabulary field to bridge.
 * @returns The current terms and a setter that replaces them.
 */
export const useVocabularyField = ({
  control,
  setValue,
  name,
}: UseVocabularyFieldArgs): VocabularyField => {
  const raw = useWatch({ control, name }) ?? '';

  const terms = useMemo(
    () => [...new Set(splitList(raw).map(normalizeVocabularyTerm).filter(Boolean))],
    [raw]
  );

  const setTerms = useCallback(
    (next: string[]): void => {
      const normalized = [...new Set(next.map(normalizeVocabularyTerm).filter(Boolean))];
      setValue(name, normalized.join(','), { shouldDirty: true, shouldValidate: true });
    },
    [name, setValue]
  );

  return { terms, setTerms };
};
