/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import { useWatch } from 'react-hook-form';

import { toIsoDay } from '@/lib/utils/validation/iso-date';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { lookupPairKey } from './release-date-lookup-policy';
import { useVideoDescriptionLookupQuery } from '../_hooks/use-video-description-lookup-query';

import type { UseFormReturn } from 'react-hook-form';

export interface UseDescriptionAutoGenerateArgs {
  form: UseFormReturn<VideoFormData>;
  /** The (title, artist) key whose release-date lookup resolved, or null. */
  lookupResolvedKey: string | null;
}

/**
 * Generates the description once, automatically, after the release-date
 * lookup has RESOLVED (found or exhausted) for the current (title, artist)
 * pair — so the prose is written with the best date available, never with a
 * guessed one. Blank-only: it fires only while the description is empty and
 * re-checks emptiness before writing, so text typed during the round-trip
 * wins. One shot per (title, artist, releasedOn) triple, recorded
 * synchronously before the request starts (StrictMode-safe); a later date
 * change is a new triple. Never retries (the route is rate-limited) and
 * stays silent on null or error — the "Generate description" button remains
 * for a manual retry.
 *
 * Known divergence: the enrichment Lambda may also auto-apply its own prose
 * onto the ROW while this form holds the generated text; the form's value
 * wins on Save. The fill is dirty and not autosaved.
 */
export const useDescriptionAutoGenerate = ({
  form,
  lookupResolvedKey,
}: UseDescriptionAutoGenerateArgs): void => {
  const { control, getValues, setValue } = form;
  // No `defaultValue` on these watches (see use-release-date-auto-lookup.ts).
  const title = useWatch({ control, name: 'title' }) ?? '';
  const artist = useWatch({ control, name: 'artist' }) ?? '';
  const releasedOn = useWatch({ control, name: 'releasedOn' }) ?? '';
  const description = useWatch({ control, name: 'description' }) ?? '';
  const releaseDay = toIsoDay(releasedOn) ?? undefined;

  const { refetch } = useVideoDescriptionLookupQuery(title.trim(), artist.trim(), releaseDay);
  const consumedTriples = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!lookupResolvedKey || lookupResolvedKey !== lookupPairKey(title, artist)) return;
    if (description.trim()) return;
    const triple = `${lookupResolvedKey} ${releaseDay ?? ''}`;
    if (consumedTriples.current.has(triple)) return;
    consumedTriples.current.add(triple);

    refetch()
      .then((result) => {
        const text = result.data?.description?.trim();
        if (!text || getValues('description')?.trim()) return;
        setValue('description', text, { shouldDirty: true, shouldValidate: true });
      })
      .catch(() => undefined);
  }, [lookupResolvedKey, title, artist, releaseDay, description, refetch, getValues, setValue]);
};
