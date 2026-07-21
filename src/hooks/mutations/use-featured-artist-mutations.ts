/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

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

import { useEntityMutation } from './use-entity-mutation';

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    FeaturedArtistFormData & { artistIds: string[] }
  >(
    (values) =>
      createFeaturedArtistAction(
        EMPTY_FORM_STATE,
        objectToFormData(values, { repeatKeys: ['artistIds'] })
      ),
    invalidateFeaturedArtistQueries
  );

  return {
    createFeaturedArtist: mutate,
    createFeaturedArtistAsync: mutateAsync,
    isCreatingFeaturedArtist: isPending,
  };
};

/**
 * Mutation hook wrapping {@link updateFeaturedArtistCoverArtAction}.
 */
export const useUpdateFeaturedArtistCoverArtMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    UpdateFeaturedArtistCoverArtResult,
    { featuredArtistId: string; coverArt: string }
  >(
    ({ featuredArtistId, coverArt }) =>
      updateFeaturedArtistCoverArtAction(featuredArtistId, coverArt),
    invalidateFeaturedArtistQueries
  );

  return {
    updateFeaturedArtistCoverArt: mutate,
    updateFeaturedArtistCoverArtAsync: mutateAsync,
    isUpdatingFeaturedArtistCoverArt: isPending,
  };
};

/**
 * Mutation hook wrapping {@link deleteFeaturedArtistAction} (a hard delete — the
 * model has no `deletedOn` field). Invalidates the featured-artist caches on a
 * successful result so the admin listing and home-page carousel drop the entry.
 */
export const useDeleteFeaturedArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { featuredArtistId: string }
  >(
    ({ featuredArtistId }) => deleteFeaturedArtistAction(featuredArtistId),
    invalidateFeaturedArtistQueries
  );

  return {
    deleteFeaturedArtist: mutate,
    deleteFeaturedArtistAsync: mutateAsync,
    isDeletingFeaturedArtist: isPending,
  };
};

/**
 * Mutation hook wrapping {@link publishFeaturedArtistAction} — publishes a single
 * featured artist by stamping its `publishedOn`. Distinct from
 * {@link usePublishFeaturedArtistsMutation}, which republishes the whole active
 * set to the landing page. Invalidates the featured-artist caches on success.
 */
export const usePublishFeaturedArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { featuredArtistId: string }
  >(
    ({ featuredArtistId }) => publishFeaturedArtistAction(featuredArtistId),
    invalidateFeaturedArtistQueries
  );

  return {
    publishFeaturedArtist: mutate,
    publishFeaturedArtistAsync: mutateAsync,
    isPublishingFeaturedArtist: isPending,
  };
};

/**
 * Mutation hook wrapping {@link publishFeaturedArtistsToSiteAction}. Invalidates
 * the featured-artist caches on success so the freshly published carousel shows
 * immediately.
 */
export const usePublishFeaturedArtistsMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<AdminActionResult>(
    () => publishFeaturedArtistsToSiteAction(),
    invalidateFeaturedArtistQueries
  );

  return {
    publishFeaturedArtists: mutate,
    publishFeaturedArtistsAsync: mutateAsync,
    isPublishingFeaturedArtists: isPending,
  };
};
