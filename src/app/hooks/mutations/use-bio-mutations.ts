/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation } from '@tanstack/react-query';

import { generateArtistBioAction } from '@/lib/actions/generate-artist-bio-action';
import type {
  GenerateArtistBioInput,
  GenerateArtistBioActionResult,
} from '@/lib/validation/bio-generation-schema';

/**
 * Mutation hook that *triggers* async bio generation via
 * {@link generateArtistBioAction}. Generation now runs in the background, so the
 * action resolves quickly with the accepted job status; callers poll
 * {@link useArtistBioGenerationStatusQuery} for completion and the finished
 * content. No cache invalidation here — nothing has changed yet at trigger time;
 * the public pages are revalidated server-side once the job succeeds.
 *
 * @returns The TanStack mutation object for triggering bio generation.
 */
export const useGenerateArtistBioMutation = () =>
  useMutation<GenerateArtistBioActionResult, Error, GenerateArtistBioInput>({
    mutationFn: (input) => generateArtistBioAction(input),
  });
