/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createReleaseAction } from '@/lib/actions/create-release-action';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import { updateReleaseCoverArtAction } from '@/lib/actions/update-release-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate every cached surface a release mutation can affect: the release
 * listings/detail queries and the artist queries (an artist's discography
 * embeds its releases, so an edited release must refresh artist views too).
 */
const invalidateReleaseQueries = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.releases.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.all }),
  ]);

/**
 * Mutation hook wrapping {@link createReleaseAction}.
 *
 * `mutateAsync` returns the action's {@link FormState} unchanged so callers keep
 * rendering field-level errors; on a successful result the release and artist
 * caches are invalidated so the admin sees the new release immediately.
 */
export const useCreateReleaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createReleaseAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateReleaseAction}. See
 * {@link useCreateReleaseMutation} for the result/invalidation contract.
 */
export const useUpdateReleaseMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    FormState,
    Error,
    { releaseId: string; formState: FormState; formData: FormData }
  >({
    mutationFn: ({ releaseId, formState, formData }) =>
      updateReleaseAction(releaseId, formState, formData),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateReleaseCoverArtAction}. Invalidates the
 * release/artist caches on success so the new cover art shows immediately.
 */
export const useUpdateReleaseCoverArtMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateReleaseCoverArtAction>>,
    Error,
    { releaseId: string; coverArt: string }
  >({
    mutationFn: ({ releaseId, coverArt }) => updateReleaseCoverArtAction(releaseId, coverArt),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });
};
