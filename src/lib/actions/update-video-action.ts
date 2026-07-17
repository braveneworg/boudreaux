/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
import type { ServiceResponse } from '@/lib/services/service.types';
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
  artistDetailsDiffer,
  buildVideoUpdateInput,
  confirmVideoUpload,
  deleteReplacedVideoAssets,
  kickPostSaveEnrichment,
  syncVideoProducersAfterSave,
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
 * Schedule the post-update enrichment kick when the update changed something
 * enrichment cares about. An artist-string change or a file replacement kicks
 * immediately (re-syncing `VideoArtist` links and, for a replacement, re-probing)
 * — and, via the kick's own category gate, re-dispatches the async web
 * enrichment for a MUSIC video.
 *
 * Otherwise, when only `artistDetails` are supplied — the common case in the
 * draft flow, where an ordinary save must not re-run a job that already ran at
 * upload-complete — the change check is deferred into `after()`: it reads the
 * linked artists off the request path and only kicks when the details actually
 * differ from the stored name parts (see {@link artistDetailsDiffer}). No-op
 * when nothing relevant changed.
 *
 * Producer sync is NOT included here — it runs in its own `after()` call in
 * {@link runVideoUpdate} so that clearing all producers persists correctly.
 */
const scheduleUpdateEnrichment = (
  current: Video,
  data: VideoFormData,
  s3KeyReplaced: boolean
): void => {
  const artistChanged = data.artist !== current.artist;
  if (artistChanged || s3KeyReplaced) {
    after(() =>
      kickPostSaveEnrichment({
        videoId: current.id,
        artist: data.artist,
        category: data.category,
        reProbe: s3KeyReplaced,
        artistDetails: data.artistDetails,
      })
    );
    return;
  }
  const details = data.artistDetails;
  if (!details?.length) return;
  // Details-only saves are common in the draft flow — verify an ACTUAL change
  // against the linked artists before re-running a job that already ran.
  after(async () => {
    const rows = await VideoArtistRepository.findByVideoId(current.id);
    if (!artistDetailsDiffer(details, rows)) return;
    await kickPostSaveEnrichment({
      videoId: current.id,
      artist: data.artist,
      category: data.category,
      reProbe: false,
      artistDetails: details,
    });
  });
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
    // Sync producers whenever the field was present in the payload — even when
    // empty ([] means "clear all"), so clearing to zero is always persisted.
    if (data.producers !== undefined) {
      after(() =>
        syncVideoProducersAfterSave({
          videoId,
          producers: data.producers ?? [],
          createdBy: userId,
        })
      );
    }
    scheduleUpdateEnrichment(current, data, s3KeyReplaced);
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
