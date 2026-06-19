/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createFeaturedArtistAction } from '@/lib/actions/create-featured-artist-action';
import { publishFeaturedArtistsToSiteAction } from '@/lib/actions/publish-featured-artists-action';
import { updateFeaturedArtistCoverArtAction } from '@/lib/actions/update-featured-artist-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

/**
 * Invalidate the featured-artist caches (admin listing, active list) so the
 * home-page carousel and admin views reflect the change immediately.
 */
const invalidateFeaturedArtistQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.featuredArtists.all });

/**
 * Mutation hook wrapping {@link createFeaturedArtistAction}. `mutateAsync`
 * returns the action's {@link FormState} unchanged; the featured-artist caches
 * are invalidated on a successful result.
 */
export const useCreateFeaturedArtistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<FormState, Error, { formState: FormState; formData: FormData }>({
    mutationFn: ({ formState, formData }) => createFeaturedArtistAction(formState, formData),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });
};

/**
 * Mutation hook wrapping {@link updateFeaturedArtistCoverArtAction}.
 */
export const useUpdateFeaturedArtistCoverArtMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateFeaturedArtistCoverArtAction>>,
    Error,
    { featuredArtistId: string; coverArt: string }
  >({
    mutationFn: ({ featuredArtistId, coverArt }) =>
      updateFeaturedArtistCoverArtAction(featuredArtistId, coverArt),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });
};

/**
 * Mutation hook wrapping {@link publishFeaturedArtistsToSiteAction}. Invalidates
 * the featured-artist caches on success so the freshly published carousel shows
 * immediately.
 */
export const usePublishFeaturedArtistsMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<Awaited<ReturnType<typeof publishFeaturedArtistsToSiteAction>>, Error, void>({
    mutationFn: () => publishFeaturedArtistsToSiteAction(),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });
};
