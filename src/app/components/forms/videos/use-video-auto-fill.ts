/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import {
  useReleaseDateAutoLookup,
  type ReleaseDateLookupStatus,
} from './use-release-date-auto-lookup';
import { useReleaseDateAutosave } from './use-release-date-autosave';
import { formatDateForForm } from './video-form-helpers';

import type { VideoUploadStatus } from './use-video-upload';
import type { UseFormReturn } from 'react-hook-form';

export interface UseVideoAutoFillArgs {
  form: UseFormReturn<VideoFormData>;
  /** The multipart upload state machine's status. */
  uploadStatus: VideoUploadStatus;
  /** The loaded row in edit mode (undefined until the query settles). */
  video: VideoRow | null | undefined;
  isEditMode: boolean;
  /** The id of the persisted row (edit id, else draft id), or undefined. */
  effectiveVideoId: string | undefined;
  category: string | undefined;
}

export interface UseVideoAutoFillResult {
  releaseDateLookupStatus: ReleaseDateLookupStatus;
}

/**
 * Composes the form's automatic fills — the ONLY hook `VideoForm` calls for
 * them, keeping it under the component line cap:
 *
 * 1. the bounded release-date lookup (fills an empty date),
 * 2. the release-date autosave (persists any date change once a row exists).
 *
 * The description is deliberately NOT filled here: it is only ever entered in
 * the enrichment panel's editor or written there by the async enrichment run
 * (ADR-0005). In edit mode the row counts as persisted only once it has
 * loaded, so the lookup's edit-open gate sees the row's real (possibly empty)
 * date and the autosave seeds from it instead of writing on open.
 */
export const useVideoAutoFill = ({
  form,
  uploadStatus,
  video,
  isEditMode,
  effectiveVideoId,
  category,
}: UseVideoAutoFillArgs): UseVideoAutoFillResult => {
  const hasPersistedRow = isEditMode ? Boolean(video) : effectiveVideoId !== undefined;
  const { status } = useReleaseDateAutoLookup({
    form,
    uploadStatus,
    hasPersistedRow,
    category,
  });
  useReleaseDateAutosave({
    form,
    videoId: effectiveVideoId,
    persistedReleasedOn: video ? formatDateForForm(video.releasedOn) : '',
  });
  return { releaseDateLookupStatus: status };
};
