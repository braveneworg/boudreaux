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
 * which leaves those fields clean. Unsaved edits to every other field are kept,
 * still dirty, and still wait for an explicit Save — an automatic full-form
 * submit would have committed them unasked.
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
 * @returns A stable callback that applies one run's generated content.
 */
export const useApplyGeneratedBio = ({
  form,
  artistId,
}: UseApplyGeneratedBioOptions): ((content: GeneratedBioContent) => void) => {
  const queryClient = useQueryClient();
  const { setValue, resetField, getFieldState } = form;

  return useCallback(
    (content: GeneratedBioContent): void => {
      const adoptPersisted = (name: GeneratedBioFieldName, value: string): void => {
        setValue(name, value, { shouldDirty: true });
        resetField(name, { defaultValue: value });
      };

      adoptPersisted('shortBio', content.shortBio);
      adoptPersisted('bio', content.longBio);
      adoptPersisted('altBio', content.altBio);
      // Genres are human-owned (ADR-0009), and a generation can complete while
      // an admin is mid-edit. Adopting then would replace their unsaved pills
      // AND `resetField` would mark the form clean, so the loss is silent.
      if (content.genres && !getFieldState('genres').isDirty) {
        adoptPersisted('genres', content.genres);
      }

      if (artistId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.artists.detail(artistId),
          refetchType: 'none',
        });
      }
    },
    [artistId, getFieldState, queryClient, resetField, setValue]
  );
};
