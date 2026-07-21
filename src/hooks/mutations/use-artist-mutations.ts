/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { archiveArtistAction } from '@/lib/actions/archive-artist-action';
import { createArtistAction } from '@/lib/actions/create-artist-action';
import { publishArtistAction } from '@/lib/actions/publish-artist-action';
import { restoreArtistAction } from '@/lib/actions/restore-artist-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { updateArtistAction } from '@/lib/actions/update-artist-action';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { ArtistFormData } from '@/lib/validation/create-artist-schema';

import { useEntityMutation } from './use-entity-mutation';

import type { QueryClient } from '@tanstack/react-query';

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
  const { mutate, mutateAsync, isPending } = useEntityMutation<FormState, ArtistFormData>(
    (values) => createArtistAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateArtistQueries
  );

  return { createArtist: mutate, createArtistAsync: mutateAsync, isCreatingArtist: isPending };
};

/**
 * Mutation hook wrapping {@link updateArtistAction}. Empty fields are omitted (the
 * artist form does not clear values by submitting blanks). See
 * {@link useCreateArtistMutation} for the result/invalidation contract.
 */
export const useUpdateArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    { id: string; values: ArtistFormData }
  >(
    ({ id, values }) => updateArtistAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateArtistQueries
  );

  return { updateArtist: mutate, updateArtistAsync: mutateAsync, isUpdatingArtist: isPending };
};

/**
 * Mutation hook wrapping {@link archiveArtistAction} (a soft delete — the model
 * has a `deletedOn` field, so the artist is archived rather than removed).
 * Invalidates the artist/release caches on a successful result.
 */
export const useArchiveArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { artistId: string }
  >(({ artistId }) => archiveArtistAction(artistId), invalidateArtistQueries);

  return { archiveArtist: mutate, archiveArtistAsync: mutateAsync, isArchivingArtist: isPending };
};

/**
 * Mutation hook wrapping {@link publishArtistAction} (stamps `publishedOn`).
 * Invalidates the artist/release caches on a successful result.
 */
export const usePublishArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { artistId: string }
  >(({ artistId }) => publishArtistAction(artistId), invalidateArtistQueries);

  return { publishArtist: mutate, publishArtistAsync: mutateAsync, isPublishingArtist: isPending };
};

/**
 * Mutation hook wrapping {@link restoreArtistAction} (clears `deletedOn` to
 * un-archive a soft-deleted artist). Invalidates the artist/release caches on a
 * successful result.
 */
export const useRestoreArtistMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { artistId: string }
  >(({ artistId }) => restoreArtistAction(artistId), invalidateArtistQueries);

  return { restoreArtist: mutate, restoreArtistAsync: mutateAsync, isRestoringArtist: isPending };
};
