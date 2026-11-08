/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import type { ServiceResponse } from '@/lib/services/service.types';
import { VideoService } from '@/lib/services/video-service';
import type { CreateVideoData, Video } from '@/lib/types/domain/video';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import { createVideoSchema } from '@/lib/validation/create-video-schema';

import {
  applyServiceFailure,
  type FailureFieldTable,
  refusedFormState,
} from './form-state-helpers';
import {
  buildVideoCreateInput,
  confirmVideoUpload,
  resolvePersistableCandidates,
  VIDEO_PERMITTED_FIELD_NAMES,
} from './video-action-helpers';

/**
 * A video has no unique field besides its id (prisma/schema.prisma), so a
 * DUPLICATE on create is the pre-generated id already saved, never a title
 * clash.
 */
const CREATE_VIDEO_FAILURES: FailureFieldTable = {
  fields: new Map([
    [
      'DUPLICATE',
      {
        field: 'general',
        message: 'This video has already been saved. Reload the page to edit it.',
      },
    ],
  ]),
  fallback: 'Failed to create video',
};

/** Apply a `VideoService.createVideo` result: the created id, or the mapped failure. */
const applyServiceResponseToFormState = (
  formState: FormState,
  response: ServiceResponse<Video>
): void => {
  if (!response.success) {
    applyServiceFailure(formState, response, CREATE_VIDEO_FAILURES);
    return;
  }
  formState.errors = undefined;
  formState.data = { videoId: response.data.id };
  formState.success = true;
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

    // A create IS a fresh file — s3KeyReplaced is true by definition.
    const candidates = resolvePersistableCandidates(data, preGeneratedId, true);
    const input: CreateVideoData = buildVideoCreateInput(data, preGeneratedId, userId, candidates);
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
      await VideoService.schedulePostSave({
        intent: 'create',
        videoId: response.data.id,
        next: data,
        createdBy: userId,
      });
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
  const gate = await gateAction('admin');
  if (!gate.success) {
    return refusedFormState(gate);
  }
  const { session } = gate;

  // Read the pre-generated ObjectId before getActionState, which strips
  // non-permitted fields.
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
