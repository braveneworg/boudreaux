/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useMutation, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  const {
    mutate: createVideo,
    mutateAsync: createVideoAsync,
    isPending: isCreatingVideo,
    isError: isCreateVideoError,
    error: createVideoError,
    data: createdVideo,
    reset: resetCreateVideo,
  } = useMutation<FormState, Error, VideoFormData & { preGeneratedId?: string }>({
    mutationFn: (values) => createVideoAction(EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    createVideo,
    createVideoAsync,
    isCreatingVideo,
    isCreateVideoError,
    createVideoError,
    createdVideo,
    resetCreateVideo,
  };
};

/**
 * Mutation hook wrapping {@link updateVideoAction}. See
 * {@link useCreateVideoMutation} for the result/invalidation contract.
 */
export const useUpdateVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: updateVideo,
    mutateAsync: updateVideoAsync,
    isPending: isUpdatingVideo,
    isError: isUpdateVideoError,
    error: updateVideoError,
    data: updatedVideo,
    reset: resetUpdateVideo,
  } = useMutation<FormState, Error, { id: string; values: VideoFormData }>({
    mutationFn: ({ id, values }) =>
      updateVideoAction(id, EMPTY_FORM_STATE, objectToFormData(values)),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    updateVideo,
    updateVideoAsync,
    isUpdatingVideo,
    isUpdateVideoError,
    updateVideoError,
    updatedVideo,
    resetUpdateVideo,
  };
};

/**
 * Mutation hook wrapping {@link publishVideoAction} (stamps `publishedAt`).
 * Invalidates the video caches on a successful result.
 */
export const usePublishVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: publishVideo,
    mutateAsync: publishVideoAsync,
    isPending: isPublishingVideo,
    isError: isPublishVideoError,
    error: publishVideoError,
    reset: resetPublishVideo,
  } = useMutation<AdminActionResult, Error, { videoId: string }>({
    mutationFn: ({ videoId }) => publishVideoAction(videoId),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    publishVideo,
    publishVideoAsync,
    isPublishingVideo,
    isPublishVideoError,
    publishVideoError,
    resetPublishVideo,
  };
};

/**
 * Mutation hook wrapping {@link unpublishVideoAction} (clears `publishedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useUnpublishVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: unpublishVideo,
    mutateAsync: unpublishVideoAsync,
    isPending: isUnpublishingVideo,
    isError: isUnpublishVideoError,
    error: unpublishVideoError,
    reset: resetUnpublishVideo,
  } = useMutation<AdminActionResult, Error, { videoId: string }>({
    mutationFn: ({ videoId }) => unpublishVideoAction(videoId),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    unpublishVideo,
    unpublishVideoAsync,
    isUnpublishingVideo,
    isUnpublishVideoError,
    unpublishVideoError,
    resetUnpublishVideo,
  };
};

/**
 * Mutation hook wrapping {@link archiveVideoAction} (stamps `archivedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useArchiveVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: archiveVideo,
    mutateAsync: archiveVideoAsync,
    isPending: isArchivingVideo,
    isError: isArchiveVideoError,
    error: archiveVideoError,
    reset: resetArchiveVideo,
  } = useMutation<AdminActionResult, Error, { videoId: string }>({
    mutationFn: ({ videoId }) => archiveVideoAction(videoId),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    archiveVideo,
    archiveVideoAsync,
    isArchivingVideo,
    isArchiveVideoError,
    archiveVideoError,
    resetArchiveVideo,
  };
};

/**
 * Mutation hook wrapping {@link restoreVideoAction} (clears `archivedAt`).
 * Invalidates the video caches on a successful result.
 */
export const useRestoreVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: restoreVideo,
    mutateAsync: restoreVideoAsync,
    isPending: isRestoringVideo,
    isError: isRestoreVideoError,
    error: restoreVideoError,
    reset: resetRestoreVideo,
  } = useMutation<AdminActionResult, Error, { videoId: string }>({
    mutationFn: ({ videoId }) => restoreVideoAction(videoId),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    restoreVideo,
    restoreVideoAsync,
    isRestoringVideo,
    isRestoreVideoError,
    restoreVideoError,
    resetRestoreVideo,
  };
};

/**
 * Mutation hook wrapping {@link deleteVideoAction} (a hard delete — the DB row
 * plus best-effort S3 cleanup). Invalidates the video caches on a successful
 * result so listings drop the removed video.
 */
export const useDeleteVideoMutation = () => {
  const queryClient = useQueryClient();
  const {
    mutate: deleteVideo,
    mutateAsync: deleteVideoAsync,
    isPending: isDeletingVideo,
    isError: isDeleteVideoError,
    error: deleteVideoError,
    reset: resetDeleteVideo,
  } = useMutation<AdminActionResult, Error, { videoId: string }>({
    mutationFn: ({ videoId }) => deleteVideoAction(videoId),
    onSuccess: (result) => (result.success ? invalidateVideoQueries(queryClient) : undefined),
  });

  return {
    deleteVideo,
    deleteVideoAsync,
    isDeletingVideo,
    isDeleteVideoError,
    deleteVideoError,
    resetDeleteVideo,
  };
};
