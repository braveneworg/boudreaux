/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { archiveArtistAction } from '@/lib/actions/archive-artist-action';
import { createArtistAction } from '@/lib/actions/create-artist-action';
import { publishArtistAction } from '@/lib/actions/publish-artist-action';
import { restoreArtistAction } from '@/lib/actions/restore-artist-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

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
 * Mutation hook wrapping {@link createArtistAction}. Accepts the validated artist
 * values and serializes them to `FormData` internally; the returned helpers
 * resolve to the action's {@link FormState} and the artist/release caches are
 * invalidated on a successful result.
 */
export const useCreateArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: createArtist,
    mutateAsync: createArtistAsync,
    isPending: isCreatingArtist,
    isError: isCreateArtistError,
    error: createArtistError,
    data: createdArtist,
    reset: resetCreateArtist,
  } = useMutation<FormState, Error, ArtistFormData>({
    mutationFn: (values) => createArtistAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });

  return {
    createArtist,
    createArtistAsync,
    isCreatingArtist,
    isCreateArtistError,
    createArtistError,
    createdArtist,
    resetCreateArtist,
  };
};

/**
 * Mutation hook wrapping {@link updateArtistAction}. Empty fields are omitted (the
 * artist form does not clear values by submitting blanks). See
 * {@link useCreateArtistMutation} for the result/invalidation contract.
 */
export const useUpdateArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateArtist,
    mutateAsync: updateArtistAsync,
    isPending: isUpdatingArtist,
    isError: isUpdateArtistError,
    error: updateArtistError,
    data: updatedArtist,
    reset: resetUpdateArtist,
  } = useMutation<FormState, Error, { id: string; values: ArtistFormData }>({
    mutationFn: ({ id, values }) =>
      updateArtistAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });

  return {
    updateArtist,
    updateArtistAsync,
    isUpdatingArtist,
    isUpdateArtistError,
    updateArtistError,
    updatedArtist,
    resetUpdateArtist,
  };
};

/**
 * Mutation hook wrapping {@link archiveArtistAction} (a soft delete — the model
 * has a `deletedOn` field, so the artist is archived rather than removed).
 * Invalidates the artist/release caches on a successful result.
 */
export const useArchiveArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: archiveArtist,
    mutateAsync: archiveArtistAsync,
    isPending: isArchivingArtist,
    isError: isArchiveArtistError,
    error: archiveArtistError,
    reset: resetArchiveArtist,
  } = useMutation<Awaited<ReturnType<typeof archiveArtistAction>>, Error, { artistId: string }>({
    mutationFn: ({ artistId }) => archiveArtistAction(artistId),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });

  return {
    archiveArtist,
    archiveArtistAsync,
    isArchivingArtist,
    isArchiveArtistError,
    archiveArtistError,
    resetArchiveArtist,
  };
};

/**
 * Mutation hook wrapping {@link publishArtistAction} (stamps `publishedOn`).
 * Invalidates the artist/release caches on a successful result.
 */
export const usePublishArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: publishArtist,
    mutateAsync: publishArtistAsync,
    isPending: isPublishingArtist,
    isError: isPublishArtistError,
    error: publishArtistError,
    reset: resetPublishArtist,
  } = useMutation<Awaited<ReturnType<typeof publishArtistAction>>, Error, { artistId: string }>({
    mutationFn: ({ artistId }) => publishArtistAction(artistId),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });

  return {
    publishArtist,
    publishArtistAsync,
    isPublishingArtist,
    isPublishArtistError,
    publishArtistError,
    resetPublishArtist,
  };
};

/**
 * Mutation hook wrapping {@link restoreArtistAction} (clears `deletedOn` to
 * un-archive a soft-deleted artist). Invalidates the artist/release caches on a
 * successful result.
 */
export const useRestoreArtistMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: restoreArtist,
    mutateAsync: restoreArtistAsync,
    isPending: isRestoringArtist,
    isError: isRestoreArtistError,
    error: restoreArtistError,
    reset: resetRestoreArtist,
  } = useMutation<Awaited<ReturnType<typeof restoreArtistAction>>, Error, { artistId: string }>({
    mutationFn: ({ artistId }) => restoreArtistAction(artistId),
    onSuccess: (result) => (result.success ? invalidateArtistQueries(queryClient) : undefined),
  });

  return {
    restoreArtist,
    restoreArtistAsync,
    isRestoringArtist,
    isRestoreArtistError,
    restoreArtistError,
    resetRestoreArtist,
  };
};
