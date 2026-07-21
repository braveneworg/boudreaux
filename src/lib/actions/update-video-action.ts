/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import type { ServiceResponse } from '@/lib/services/service.types';
import {
  planVideoPostSave,
  runVideoPostSave,
  syncVideoProducersAfterSave,
  videoPostSaveHasWork,
} from '@/lib/services/video-post-save-service';
import { VideoService } from '@/lib/services/video-service';
import type { Video } from '@/lib/types/domain/video';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { createVideoSchema } from '@/lib/validation/create-video-schema';

import {
  buildVideoUpdateInput,
  confirmVideoUpload,
  deleteReplacedVideoAssets,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

/** Map a `VideoService.updateVideo` error message onto the form state. */
const mapVideoServiceError = (errorMessage: string, formState: FormState): void => {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('not found')) {
    formState.errors = { ...formState.errors, general: ['Video not found'] };
  } else {
    formState.errors = { general: ['Failed to update video'] };
  }
};

/** Apply the update result: the video id on success, or a mapped error. */
const applyUpdateResult = (
  response: ServiceResponse<Video>,
  videoId: string,
  formState: FormState
): void => {
  if (response.success) {
    formState.errors = undefined;
    formState.data = { videoId };
  } else {
    if (!formState.errors) {
      formState.errors = {};
    }
    mapVideoServiceError(response.error || 'Failed to update video', formState);
  }
  formState.success = response.success;
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

  const response = await VideoService.updateVideo(videoId, buildVideoUpdateInput(data, userId));

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

    const plan = planVideoPostSave({ intent: 'update', next: data, previous: current });
    if (plan.syncProducers) {
      after(() =>
        syncVideoProducersAfterSave({
          videoId,
          producers: data.producers ?? [],
          createdBy: userId,
        })
      );
    }
    if (videoPostSaveHasWork(plan)) {
      after(() =>
        runVideoPostSave({
          videoId,
          artist: data.artist,
          artistDetails: data.artistDetails,
          plan,
        })
      );
    }
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
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  if (!OBJECT_ID_REGEX.test(videoId)) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Invalid video ID'] },
    };
  }

  const { formState, parsed } = getActionState(
    payload,
    VIDEO_PERMITTED_FIELD_NAMES,
    createVideoSchema
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
