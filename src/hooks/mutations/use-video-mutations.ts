/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { archiveVideoAction } from '@/lib/actions/archive-video-action';
import { createVideoAction } from '@/lib/actions/create-video-action';
import { deleteVideoAction } from '@/lib/actions/delete-video-action';
import { publishVideoAction } from '@/lib/actions/publish-video-action';
import { restoreVideoAction } from '@/lib/actions/restore-video-action';
import type { AdminActionResult } from '@/lib/actions/run-admin-entity-action';
import { unpublishVideoAction } from '@/lib/actions/unpublish-video-action';
import { updateVideoAction } from '@/lib/actions/update-video-action';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import { objectToFormData } from '@/lib/utils/forms/object-to-form-data';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useEntityMutation } from './use-entity-mutation';

import type { Query, QueryClient } from '@tanstack/react-query';

/**
 * Returns true for every `videos.*` query except `videos.probePrefill`.
 * The probePrefill query has `staleTime: Infinity` but that does NOT prevent
 * invalidation-triggered refetches — excluding it avoids a wasted ffprobe when
 * a create/update mutation succeeds while the probe query is still mounted.
 */
const isNonProbePrefillVideoQuery = (query: Query): boolean =>
  query.queryKey[0] === 'videos' && query.queryKey[1] !== 'probePrefill';

/**
 * Invalidate every cached video surface a mutation can affect. Videos are a
 * standalone entity (no embedded relations to refresh), so the `videos` prefix
 * covers the admin listing, the public listing, and detail queries. The
 * `probePrefill` key is excluded — see {@link isNonProbePrefillVideoQuery}.
 */
const invalidateVideoQueries = (queryClient: QueryClient): Promise<unknown> =>
  queryClient.invalidateQueries({ predicate: isNonProbePrefillVideoQuery });

/**
 * Mutation hook wrapping {@link createVideoAction} — the DB-confirm half of the
 * multipart upload flow. Accepts the validated video values plus the
 * pre-generated id and serializes them to `FormData` internally; the video
 * caches are invalidated on a successful result.
 */
export const useCreateVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    VideoFormData & { preGeneratedId?: string }
  >(
    (values) => createVideoAction(EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateVideoQueries
  );

  return { createVideo: mutate, createVideoAsync: mutateAsync, isCreatingVideo: isPending };
};

/**
 * Mutation hook wrapping {@link updateVideoAction}. See
 * {@link useCreateVideoMutation} for the result/invalidation contract.
 */
export const useUpdateVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    FormState,
    { id: string; values: VideoFormData }
  >(
    ({ id, values }) => updateVideoAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    invalidateVideoQueries
  );

  return { updateVideo: mutate, updateVideoAsync: mutateAsync, isUpdatingVideo: isPending };
};

/**
 * Mutation hook wrapping {@link publishVideoAction} (stamps `publishedAt`).
 * Invalidates the video caches on a successful result.
 */
export const usePublishVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string }
  >(({ videoId }) => publishVideoAction(videoId), invalidateVideoQueries);

  return { publishVideo: mutate, publishVideoAsync: mutateAsync, isPublishingVideo: isPending };
};

/**
 * Mutation hook wrapping {@link unpublishVideoAction} (clears `publishedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useUnpublishVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string }
  >(({ videoId }) => unpublishVideoAction(videoId), invalidateVideoQueries);

  return {
    unpublishVideo: mutate,
    unpublishVideoAsync: mutateAsync,
    isUnpublishingVideo: isPending,
  };
};

/**
 * Mutation hook wrapping {@link archiveVideoAction} (stamps `archivedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useArchiveVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string }
  >(({ videoId }) => archiveVideoAction(videoId), invalidateVideoQueries);

  return { archiveVideo: mutate, archiveVideoAsync: mutateAsync, isArchivingVideo: isPending };
};

/**
 * Mutation hook wrapping {@link restoreVideoAction} (clears `archivedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useRestoreVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string }
  >(({ videoId }) => restoreVideoAction(videoId), invalidateVideoQueries);

  return { restoreVideo: mutate, restoreVideoAsync: mutateAsync, isRestoringVideo: isPending };
};

/**
 * Mutation hook wrapping {@link deleteVideoAction} (a hard delete — the DB row
 * plus best-effort S3 cleanup). Invalidates the video caches on a successful
 * result so listings drop the removed video.
 */
export const useDeleteVideoMutation = () => {
  const { mutate, mutateAsync, isPending } = useEntityMutation<
    AdminActionResult,
    { videoId: string }
  >(({ videoId }) => deleteVideoAction(videoId), invalidateVideoQueries);

  return { deleteVideo: mutate, deleteVideoAsync: mutateAsync, isDeletingVideo: isPending };
};
