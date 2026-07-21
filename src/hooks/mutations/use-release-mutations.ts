/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { createReleaseAction } from '@/lib/actions/create-release-action';
import { deleteReleaseAction } from '@/lib/actions/delete-release-action';
import { publishReleaseAction } from '@/lib/actions/publish-release-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { updateReleaseAction } from '@/lib/actions/update-release-action';
import {
  updateReleaseCoverArtAction,
  type UpdateReleaseCoverArtResult,
} from '@/lib/actions/update-release-cover-art-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { ReleaseFormData } from '@/lib/validation/create-release-schema';

import { useEntityMutation } from './use-entity-mutation';

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    ReleaseFormData & { preGeneratedId?: string }
  >(
    (values) => createReleaseAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateReleaseQueries
  );

  return { createRelease: mutate, createReleaseAsync: mutateAsync, isCreatingRelease: isPending };
};

/**
 * Mutation hook wrapping {@link updateReleaseAction}. See
 * {@link useCreateReleaseMutation} for the result/invalidation contract.
 */
export const useUpdateReleaseMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    { id: string; values: ReleaseFormData }
  >(
    ({ id, values }) => updateReleaseAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateReleaseQueries
  );

  return { updateRelease: mutate, updateReleaseAsync: mutateAsync, isUpdatingRelease: isPending };
};

/**
 * Mutation hook wrapping {@link updateReleaseCoverArtAction}. Invalidates the
 * release/artist caches on success so the new cover art shows immediately.
 */
export const useUpdateReleaseCoverArtMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    UpdateReleaseCoverArtResult,
    { releaseId: string; coverArt: string }
  >(
    ({ releaseId, coverArt }) => updateReleaseCoverArtAction(releaseId, coverArt),
    invalidateReleaseQueries
  );

  return {
    updateReleaseCoverArt: mutate,
    updateReleaseCoverArtAsync: mutateAsync,
    isUpdatingReleaseCoverArt: isPending,
  };
};

/**
 * Mutation hook wrapping {@link deleteReleaseAction} (a hard delete — cascades to
 * the release's related records and S3 objects). Invalidates the release/artist
 * caches on a successful result so listings drop the removed release.
 */
export const useDeleteReleaseMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { releaseId: string }
  >(({ releaseId }) => deleteReleaseAction(releaseId), invalidateReleaseQueries);

  return { deleteRelease: mutate, deleteReleaseAsync: mutateAsync, isDeletingRelease: isPending };
};

/**
 * Mutation hook wrapping {@link publishReleaseAction} (stamps `publishedAt`).
 * Invalidates the release/artist caches on a successful result.
 */
export const usePublishReleaseMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { releaseId: string }
  >(({ releaseId }) => publishReleaseAction(releaseId), invalidateReleaseQueries);

  return {
    publishRelease: mutate,
    publishReleaseAsync: mutateAsync,
    isPublishingRelease: isPending,
  };
};
