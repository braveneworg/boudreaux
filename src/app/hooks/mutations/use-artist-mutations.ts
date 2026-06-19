/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createArtistAction } from '@/lib/actions/create-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate every cached surface an artist mutation can affect: the artist
 * queries and the release queries (an artist's display name renders on release
 * cards/listings, so an edited artist must refresh release views too).
 */
const invalidateArtistQueries = (queryClient: QueryClient): Promise<unknown> =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.artists.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.releases.all }),
  ]);

/**
 * Mutation hook wrapping {@link createArtistAction}.
 *
 * `mutateAsync` returns the action's {@link FormState} unchanged so callers keep
 * rendering field-level errors; on a successful result the artist and release
 * caches are invalidated so the admin sees the change immediately.
 */
export const useCreateArtistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createArtistAction(formState, formData),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });
};

/**
 * Mutation hook wrapping {@link updateArtistAction}. See
 * {@link useCreateArtistMutation} for the result/invalidation contract.
 */
export const useUpdateArtistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    FormState,
    Error,
    { artistId: string; formState: FormState; formData: FormData }
  >({
    mutationFn: ({ artistId, formState, formData }) =>
      updateArtistAction(artistId, formState, formData),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });
};
