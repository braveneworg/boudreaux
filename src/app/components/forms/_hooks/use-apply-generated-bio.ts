/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import type { UseFormReturn } from 'react-hook-form';

type GeneratedBioFieldName = 'shortBio' | 'bio' | 'altBio' | 'genres';

/** The form fields a generation may fill, in the order they are reported. */
const GENERATED_FIELD_LABELS: ReadonlyMap<GeneratedBioFieldName, string> = new Map([
  ['shortBio', 'Short Bio'],
  ['bio', 'Bio'],
  ['altBio', 'Alternative Bio'],
  ['genres', 'Genres'],
]);

/** What a run adopted and what it left alone because the admin was editing it. */
export interface AppliedGeneratedBio {
  /** Labels of the fields kept as the admin's unsaved text. */
  kept: string[];
}

interface UseApplyGeneratedBioOptions {
  form: UseFormReturn<ArtistFormData>;
  artistId: string | null;
}

/**
 * Projects a finished bio generation into the artist form as ALREADY-SAVED
 * content, so the admin never has to scroll down and press Save to keep it.
 *
 * The generation job persists the bios, genres, images and links itself
 * (`persistGeneratedBio` → `ArtistRepository.replaceBioContent`) before the
 * status endpoint ever reports `succeeded`, and the content it reports is read
 * back from that row. So nothing here writes to the server: each generated
 * field's value AND default are moved to the persisted value (`resetField`),
 * which leaves those fields clean. A generated value is adopted only into a
 * field the admin has NOT edited since the last save: a run finishes minutes
 * after it started, and a dirty field keeps the admin's text (the generated
 * text is already persisted — Save writes the admin's version, a reload shows
 * the generated one). Unsaved edits to every other field are kept, still
 * dirty, and still wait for an explicit Save — an automatic full-form submit
 * would have committed them unasked.
 *
 * The cached artist detail still holds the pre-generation bios; it is marked
 * stale WITHOUT refetching — a refetch would `reset` the whole form over those
 * unrelated edits — so a later visit reloads the saved bios instead of seeding
 * the form (and a subsequent Save) with the old ones.
 *
 * `resetField` is a no-op on a field nothing has registered, so the value is
 * first written dirty: a bio field with no mounted editor degrades to the old
 * "dirty form, press Save" behaviour rather than dropping the content.
 *
 * @param form - The artist form whose bio fields receive the content.
 * @param artistId - The persisted artist the run was for; `null` skips the
 * cache invalidation.
 * @returns A stable callback that applies one run's generated content and
 * reports which fields were kept as the admin's unsaved text.
 */
export const useApplyGeneratedBio = ({
  form,
  artistId,
}: UseApplyGeneratedBioOptions): ((content: GeneratedBioContent) => AppliedGeneratedBio) => {
  const queryClient = useQueryClient();
  const { setValue, resetField, getFieldState } = form;

  return useCallback(
    (content: GeneratedBioContent): AppliedGeneratedBio => {
      const kept: string[] = [];
      const adoptPersisted = (name: GeneratedBioFieldName, value: string): void => {
        if (getFieldState(name).isDirty) {
          kept.push(GENERATED_FIELD_LABELS.get(name) ?? name);
          return;
        }
        setValue(name, value, { shouldDirty: true });
        resetField(name, { defaultValue: value });
      };

      adoptPersisted('shortBio', content.shortBio);
      adoptPersisted('bio', content.longBio);
      adoptPersisted('altBio', content.altBio);
      // Genres are human-owned (ADR-0009); a run that produced none leaves
      // the curated field alone rather than clearing it.
      if (content.genres) {
        adoptPersisted('genres', content.genres);
      }

      if (artistId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.artists.detail(artistId),
          refetchType: 'none',
        });
      }
      return { kept };
    },
    [artistId, getFieldState, queryClient, resetField, setValue]
  );
};
