/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { generateArtistBioAction } from '@/lib/actions/generate-artist-bio-action';
import { queryKeys } from '@/lib/query-keys';
import type {
  GenerateArtistBioInput,
  GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';

/**
 * Mutation hook wrapping {@link generateArtistBioAction} (read → generate →
 * sanitize → persist in {@link BioGenerationService}). Generation writes the
 * artist's bio/images/links, so on success it invalidates the artist caches and
 * the just-edited slug. `mutateAsync` returns the action result unchanged so the
 * caller can surface `data` for preview or `error` for a toast.
 *
 * @returns The TanStack mutation object for triggering bio generation.
 */
export const useGenerateArtistBioMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<GenerateArtistBioActionResult, Error, GenerateArtistBioInput>({
    mutationFn: (input) => generateArtistBioAction(input),
    onSuccess: (result) =>
      result.success
        ? queryClient.invalidateQueries({ queryKey: queryKeys.artists.all })
        : undefined,
  });
};
