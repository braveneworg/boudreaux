/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createFeaturedArtistAction } from '@/lib/actions/create-featured-artist-action';
import { deleteFeaturedArtistAction } from '@/lib/actions/delete-featured-artist-action';
import { publishFeaturedArtistAction } from '@/lib/actions/publish-featured-artist-action';
import { publishFeaturedArtistsToSiteAction } from '@/lib/actions/publish-featured-artists-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import {
  updateFeaturedArtistCoverArtAction,
  type UpdateFeaturedArtistCoverArtResult,
} from '@/lib/actions/update-featured-artist-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

/**
 * Invalidate the featured-artist caches (admin listing, active list) so the
 * home-page carousel and admin views reflect the change immediately.
 */
const invalidateFeaturedArtistQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ queryKey: queryKeys.featuredArtists.all });

/**
 * Mutation hook wrapping {@link createFeaturedArtistAction}. Accepts the featured
 * artist values plus the derived `artistIds`, which the action reads via
 * `FormData.getAll`, so they are appended individually rather than JSON-encoded.
 * The featured-artist caches are invalidated on a successful result.
 */
export const useCreateFeaturedArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createFeaturedArtist,
    mutateAsync: createFeaturedArtistAsync,
    isPending: isCreatingFeaturedArtist,
    isError: isCreateFeaturedArtistError,
    error: createFeaturedArtistError,
    data: createdFeaturedArtist,
    reset: resetCreateFeaturedArtist,
  } = useMutation<FormState, Error, FeaturedArtistFormData & { artistIds: string[] }>({
    mutationFn: (values) =>
      createFeaturedArtistAction(
        EMPTY_FORM_STATE,
        objectToFormData(values, { repeatKeys: ['artistIds'] })
      ),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });

  return {
    createFeaturedArtist,
    createFeaturedArtistAsync,
    isCreatingFeaturedArtist,
    isCreateFeaturedArtistError,
    createFeaturedArtistError,
    createdFeaturedArtist,
    resetCreateFeaturedArtist,
  };
};

/**
 * Mutation hook wrapping {@link updateFeaturedArtistCoverArtAction}.
 */
export const useUpdateFeaturedArtistCoverArtMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateFeaturedArtistCoverArt,
    mutateAsync: updateFeaturedArtistCoverArtAsync,
    isPending: isUpdatingFeaturedArtistCoverArt,
    isError: isUpdateFeaturedArtistCoverArtError,
    error: updateFeaturedArtistCoverArtError,
    reset: resetUpdateFeaturedArtistCoverArt,
  } = useMutation<
    UpdateFeaturedArtistCoverArtResult,
    Error,
    { featuredArtistId: string; coverArt: string }
  >({
    mutationFn: ({ featuredArtistId, coverArt }) =>
      updateFeaturedArtistCoverArtAction(featuredArtistId, coverArt),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });

  return {
    updateFeaturedArtistCoverArt,
    updateFeaturedArtistCoverArtAsync,
    isUpdatingFeaturedArtistCoverArt,
    isUpdateFeaturedArtistCoverArtError,
    updateFeaturedArtistCoverArtError,
    resetUpdateFeaturedArtistCoverArt,
  };
};

/**
 * Mutation hook wrapping {@link deleteFeaturedArtistAction} (a hard delete — the
 * model has no `deletedOn` field). Invalidates the featured-artist caches on a
 * successful result so the admin listing and home-page carousel drop the entry.
 */
export const useDeleteFeaturedArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteFeaturedArtist,
    mutateAsync: deleteFeaturedArtistAsync,
    isPending: isDeletingFeaturedArtist,
    isError: isDeleteFeaturedArtistError,
    error: deleteFeaturedArtistError,
    reset: resetDeleteFeaturedArtist,
  } = useMutation<AdminActionResult, Error, { featuredArtistId: string }>({
    mutationFn: ({ featuredArtistId }) => deleteFeaturedArtistAction(featuredArtistId),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });

  return {
    deleteFeaturedArtist,
    deleteFeaturedArtistAsync,
    isDeletingFeaturedArtist,
    isDeleteFeaturedArtistError,
    deleteFeaturedArtistError,
    resetDeleteFeaturedArtist,
  };
};

/**
 * Mutation hook wrapping {@link publishFeaturedArtistAction} — publishes a single
 * featured artist by stamping its `publishedOn`. Distinct from
 * {@link usePublishFeaturedArtistsMutation}, which republishes the whole active
 * set to the landing page. Invalidates the featured-artist caches on success.
 */
export const usePublishFeaturedArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: publishFeaturedArtist,
    mutateAsync: publishFeaturedArtistAsync,
    isPending: isPublishingFeaturedArtist,
    isError: isPublishFeaturedArtistError,
    error: publishFeaturedArtistError,
    reset: resetPublishFeaturedArtist,
  } = useMutation<AdminActionResult, Error, { featuredArtistId: string }>({
    mutationFn: ({ featuredArtistId }) => publishFeaturedArtistAction(featuredArtistId),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });

  return {
    publishFeaturedArtist,
    publishFeaturedArtistAsync,
    isPublishingFeaturedArtist,
    isPublishFeaturedArtistError,
    publishFeaturedArtistError,
    resetPublishFeaturedArtist,
  };
};

/**
 * Mutation hook wrapping {@link publishFeaturedArtistsToSiteAction}. Invalidates
 * the featured-artist caches on success so the freshly published carousel shows
 * immediately.
 */
export const usePublishFeaturedArtistsMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: publishFeaturedArtists,
    mutateAsync: publishFeaturedArtistsAsync,
    isPending: isPublishingFeaturedArtists,
    isError: isPublishFeaturedArtistsError,
    error: publishFeaturedArtistsError,
    reset: resetPublishFeaturedArtists,
  } = useMutation<AdminActionResult, Error, void>({
    mutationFn: () => publishFeaturedArtistsToSiteAction(),
    onSuccess: (result) =>
      result.success ? invalidateFeaturedArtistQueries(queryClient) : undefined,
  });

  return {
    publishFeaturedArtists,
    publishFeaturedArtistsAsync,
    isPublishingFeaturedArtists,
    isPublishFeaturedArtistsError,
    publishFeaturedArtistsError,
    resetPublishFeaturedArtists,
  };
};
