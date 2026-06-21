/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createReleaseAction } from '@/lib/actions/create-release-action';
import { deleteReleaseAction } from '@/lib/actions/delete-release-action';
import { publishReleaseAction } from '@/lib/actions/publish-release-action';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import { updateReleaseCoverArtAction } from '@/lib/actions/update-release-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

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
 * Mutation hook wrapping {@link createReleaseAction}. Accepts the validated
 * release values (plus the optional pre-generated id) and serializes them to
 * `FormData` internally; the release and artist caches are invalidated on a
 * successful result.
 */
export const useCreateReleaseMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createRelease,
    mutateAsync: createReleaseAsync,
    isPending: isCreatingRelease,
    isError: isCreateReleaseError,
    error: createReleaseError,
    data: createdRelease,
    reset: resetCreateRelease,
  } = useMutation<FormState, Error, ReleaseFormData & { preGeneratedId?: string }>({
    mutationFn: (values) => createReleaseAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });

  return {
    createRelease,
    createReleaseAsync,
    isCreatingRelease,
    isCreateReleaseError,
    createReleaseError,
    createdRelease,
    resetCreateRelease,
  };
};

/**
 * Mutation hook wrapping {@link updateReleaseAction}. See
 * {@link useCreateReleaseMutation} for the result/invalidation contract.
 */
export const useUpdateReleaseMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateRelease,
    mutateAsync: updateReleaseAsync,
    isPending: isUpdatingRelease,
    isError: isUpdateReleaseError,
    error: updateReleaseError,
    data: updatedRelease,
    reset: resetUpdateRelease,
  } = useMutation<FormState, Error, { id: string; values: ReleaseFormData }>({
    mutationFn: ({ id, values }) =>
      updateReleaseAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });

  return {
    updateRelease,
    updateReleaseAsync,
    isUpdatingRelease,
    isUpdateReleaseError,
    updateReleaseError,
    updatedRelease,
    resetUpdateRelease,
  };
};

/**
 * Mutation hook wrapping {@link updateReleaseCoverArtAction}. Invalidates the
 * release/artist caches on success so the new cover art shows immediately.
 */
export const useUpdateReleaseCoverArtMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateReleaseCoverArt,
    mutateAsync: updateReleaseCoverArtAsync,
    isPending: isUpdatingReleaseCoverArt,
    isError: isUpdateReleaseCoverArtError,
    error: updateReleaseCoverArtError,
    reset: resetUpdateReleaseCoverArt,
  } = useMutation<
    Awaited<ReturnType<typeof updateReleaseCoverArtAction>>,
    Error,
    { releaseId: string; coverArt: string }
  >({
    mutationFn: ({ releaseId, coverArt }) => updateReleaseCoverArtAction(releaseId, coverArt),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });

  return {
    updateReleaseCoverArt,
    updateReleaseCoverArtAsync,
    isUpdatingReleaseCoverArt,
    isUpdateReleaseCoverArtError,
    updateReleaseCoverArtError,
    resetUpdateReleaseCoverArt,
  };
};

/**
 * Mutation hook wrapping {@link deleteReleaseAction} (a hard delete — cascades to
 * the release's related records and S3 objects). Invalidates the release/artist
 * caches on a successful result so listings drop the removed release.
 */
export const useDeleteReleaseMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteRelease,
    mutateAsync: deleteReleaseAsync,
    isPending: isDeletingRelease,
    isError: isDeleteReleaseError,
    error: deleteReleaseError,
    reset: resetDeleteRelease,
  } = useMutation<Awaited<ReturnType<typeof deleteReleaseAction>>, Error, { releaseId: string }>({
    mutationFn: ({ releaseId }) => deleteReleaseAction(releaseId),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });

  return {
    deleteRelease,
    deleteReleaseAsync,
    isDeletingRelease,
    isDeleteReleaseError,
    deleteReleaseError,
    resetDeleteRelease,
  };
};

/**
 * Mutation hook wrapping {@link publishReleaseAction} (stamps `publishedAt`).
 * Invalidates the release/artist caches on a successful result.
 */
export const usePublishReleaseMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: publishRelease,
    mutateAsync: publishReleaseAsync,
    isPending: isPublishingRelease,
    isError: isPublishReleaseError,
    error: publishReleaseError,
    reset: resetPublishRelease,
  } = useMutation<Awaited<ReturnType<typeof publishReleaseAction>>, Error, { releaseId: string }>({
    mutationFn: ({ releaseId }) => publishReleaseAction(releaseId),
    onSuccess: (result) => (result.success ? invalidateReleaseQueries(queryClient) : undefined),
  });

  return {
    publishRelease,
    publishReleaseAsync,
    isPublishingRelease,
    isPublishReleaseError,
    publishReleaseError,
    resetPublishRelease,
  };
};
