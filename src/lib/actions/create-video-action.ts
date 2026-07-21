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
import type { CreateVideoData, Video } from '@/lib/types/domain/video';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { createVideoSchema } from '@/lib/validation/create-video-schema';

import {
  buildVideoCreateInput,
  confirmVideoUpload,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

/**
 * Apply a `VideoService.createVideo` result to the form state: the created id on
 * success, a title-field error for a duplicate-title conflict, or a general
 * error otherwise. Mirrors the release create action.
 */
const applyServiceResponseToFormState = (
  formState: FormState,
  response: ServiceResponse<Video>
): void => {
  if (response.success) {
    formState.errors = undefined;
    formState.data = { videoId: response.data.id };
  } else {
    if (!formState.errors) {
      formState.errors = {};
    }
    const errorMessage = response.error || 'Failed to create video';
    const lower = errorMessage.toLowerCase();
    const isTitleConflict =
      lower.includes('title') &&
      (lower.includes('unique') || lower.includes('already exists') || lower.includes('duplicate'));
    if (isTitleConflict) {
      formState.errors.title = ['This title is already in use. Please choose a different one.'];
    } else {
      formState.errors = { general: ['Failed to create video'] };
    }
  }
  formState.success = response.success;
};

/** Set a single general error on the form state (S3 confirmation failures). */
const setGeneralError = (formState: FormState, message: string): void => {
  formState.success = false;
  formState.errors = { general: [message] };
};

/**
 * Confirm the upload, create the video, log the audit event, and revalidate.
 * Split out of the action so each function stays within the complexity cap.
 */
const runVideoCreate = async (
  data: VideoFormData,
  preGeneratedId: string | undefined,
  userId: string,
  formState: FormState
): Promise<void> => {
  try {
    const confirmError = await confirmVideoUpload(data.s3Key, preGeneratedId);
    if (confirmError) {
      setGeneralError(formState, confirmError);
      return;
    }

    const input: CreateVideoData = buildVideoCreateInput(data, preGeneratedId, userId);
    const response = await VideoService.createVideo(input);

    logSecurityEvent({
      event: 'media.video.created',
      userId,
      metadata: {
        createdFields: Object.keys(data).filter(
          (key) => data[key as keyof typeof data] !== undefined
        ),
        success: response.success,
      },
    });

    applyServiceResponseToFormState(formState, response);

    revalidatePath('/admin/videos');
    if (response.success) {
      revalidatePath('/videos');
      // Both stages run after the response so the admin's save returns
      // immediately, and in separate after() calls so producer sync is
      // independent of the enrichment stages.
      const plan = planVideoPostSave({ intent: 'create', next: data });
      if (videoPostSaveHasWork(plan)) {
        after(() =>
          runVideoPostSave({
            videoId: response.data.id,
            artist: data.artist,
            artistDetails: data.artistDetails,
            plan,
          })
        );
      }
      if (plan.syncProducers) {
        after(() =>
          syncVideoProducersAfterSave({
            videoId: response.data.id,
            producers: data.producers ?? [],
            createdBy: userId,
          })
        );
      }
    }
  } catch {
    formState.success = false;
    setUnknownError(formState);
  }
};

/**
 * Server Action to create a video — the DB-confirm half of the multipart upload
 * flow. Validates admin access, parses the form via `createVideoSchema`,
 * confirms the uploaded S3 object exists under the video's namespace, then
 * persists it with the client-pre-generated ObjectId as the document id.
 */
export const createVideoAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  const session = await requireRole('admin');

  // Read the pre-generated ObjectId before getActionState (which strips
  // non-permitted fields). Read raw — not via the schema — so an all-numeric
  // ObjectId is not mangled by getActionState's numeric-string coercion.
  const rawPreGeneratedId = payload.get('preGeneratedId');
  const preGeneratedId =
    typeof rawPreGeneratedId === 'string' && isValidObjectId(rawPreGeneratedId)
      ? rawPreGeneratedId
      : undefined;

  const { formState, parsed } = getActionState(
    payload,
    VIDEO_PERMITTED_FIELD_NAMES,
    createVideoSchema
  );

  if (parsed.success) {
    await runVideoCreate(parsed.data, preGeneratedId, session.user.id, formState);
  }

  return formState;
};
