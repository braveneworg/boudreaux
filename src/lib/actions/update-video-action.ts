/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import type { ServiceResponse } from '@/lib/services/service.types';
import { VideoService } from '@/lib/services/video-service';
import type { Video } from '@/lib/types/domain/video';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { readActionInput } from '@/lib/utils/forms/read-action-input';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { createVideoSchema } from '@/lib/validation/create-video-schema';

import {
  applyServiceFailure,
  type FailureFieldTable,
  refusedFormState,
} from './form-state-helpers';
import {
  buildVideoUpdateInput,
  confirmVideoUpload,
  deleteReplacedVideoAssets,
  resolveUpdatedCandidates,
  resolveUpdatedPosterUrl,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

const UPDATE_VIDEO_FAILURES: FailureFieldTable = {
  fields: new Map([['NOT_FOUND', { field: 'general', message: 'Video not found' }]]),
  fallback: 'Failed to update video',
};

/** Apply the update result: the video id on success, or the mapped failure. */
const applyUpdateResult = (
  response: ServiceResponse<Video>,
  videoId: string,
  formState: FormState
): void => {
  if (!response.success) {
    applyServiceFailure(formState, response, UPDATE_VIDEO_FAILURES);
    return;
  }
  formState.errors = undefined;
  formState.data = { videoId };
  formState.success = true;
};

/**
 * Load the current video, confirm any file replacement, update it, then free
 * the S3 objects the update orphaned. Split out of the action so each function
 * stays within the complexity cap.
 */
const runVideoUpdate = async (
  videoId: string,
  userId: string,
  data: VideoFormData,
  formState: FormState
): Promise<void> => {
  const currentResult = await VideoService.getVideoById(videoId);
  if (!currentResult.success) {
    formState.success = false;
    formState.errors = { general: ['Video not found'] };
    return;
  }
  const current = currentResult.data;

  const s3KeyReplaced = data.s3Key !== current.s3Key;
  if (s3KeyReplaced) {
    const confirmError = await confirmVideoUpload(data.s3Key, videoId);
    if (confirmError) {
      formState.success = false;
      formState.errors = { general: [confirmError] };
      return;
    }
  }

  const candidates = resolveUpdatedCandidates(data, videoId, s3KeyReplaced);
  const response = await VideoService.updateVideo(videoId, {
    ...buildVideoUpdateInput(data, userId),
    // A file replace settles both poster halves — no frame and no poster of
    // the outgoing file carries over to the new one.
    posterUrl: resolveUpdatedPosterUrl(data, s3KeyReplaced),
    ...(candidates !== undefined ? { posterCandidates: candidates } : {}),
  });

  logSecurityEvent({
    event: 'media.video.updated',
    userId,
    metadata: { videoId, success: response.success },
  });

  applyUpdateResult(response, videoId, formState);

  if (response.success) {
    // Delete the replaced objects only after the DB row is confirmed updated.
    deleteReplacedVideoAssets(current, data, s3KeyReplaced);
    revalidatePath('/admin/videos');
    revalidatePath('/videos');

    await VideoService.schedulePostSave({
      intent: 'update',
      videoId,
      next: data,
      previous: { artist: current.artist, s3Key: current.s3Key },
      createdBy: userId,
    });
  }
};

/**
 * Server Action to update a video. Validates admin access and the id, parses
 * the form via `createVideoSchema`, and — when the video file is being
 * replaced — confirms the new S3 object before persisting, freeing the old
 * video/poster objects best-effort after a successful update.
 */
export const updateVideoAction = async (
  videoId: string,
  input: VideoFormData
): Promise<FormState> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  if (!OBJECT_ID_REGEX.test(videoId)) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Invalid video ID'] },
    };
  }

  // Blanks are omitted, as the FormData encoding did: a blank optional field
  // is left unwritten rather than cleared.
  const { formState, parsed } = readActionInput(
    input,
    VIDEO_PERMITTED_FIELD_NAMES,
    createVideoSchema,
    { blankStrings: 'omit' }
  );

  if (!parsed.success) {
    formState.success = false;
    applyZodIssuesToFormState(formState, parsed.error);
    return formState;
  }

  try {
    await runVideoUpdate(videoId, session.user.id, parsed.data, formState);
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }

  return formState;
};
