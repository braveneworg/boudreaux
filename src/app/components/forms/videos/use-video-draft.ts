/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState } from 'react';

import { createVideoDraftAction } from '@/lib/actions/create-video-draft-action';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';

import type { UseFormReturn } from 'react-hook-form';

interface UseVideoDraftArgs {
  form: UseFormReturn<VideoFormData>;
  preGeneratedId: string;
  isEditMode: boolean;
  getArtistDetails: () => VideoArtistDetail[];
}

export interface UseVideoDraftResult {
  draftId: string | null;
  handleUploadComplete: () => void;
}

/** Snapshot the in-progress form into the lenient draft payload. */
const buildDraftInput = (
  values: VideoFormData,
  preGeneratedId: string,
  artistDetails: VideoArtistDetail[]
): Record<string, unknown> => ({
  preGeneratedId,
  s3Key: values.s3Key,
  fileName: values.fileName,
  mimeType: values.mimeType,
  category: values.category,
  ...(values.title ? { title: values.title } : {}),
  ...(values.artist ? { artist: values.artist } : {}),
  ...(values.releasedOn ? { releasedOn: values.releasedOn } : {}),
  ...(values.description ? { description: values.description } : {}),
  ...(values.durationSeconds ? { durationSeconds: values.durationSeconds } : {}),
  ...(values.fileSize ? { fileSize: values.fileSize } : {}),
  ...(artistDetails.length > 0 ? { artistDetails } : {}),
});

/**
 * Owns the draft-at-upload-complete transition: snapshot the current form
 * values (corrections made during the upload ride along), create the
 * unpublished draft row, then swap the URL to the edit route WITHOUT
 * navigating (history.replaceState keeps the mounted form alive; a refresh
 * resumes on the edit page). A failed draft leaves `draftId` null and the
 * form silently falls back to create-on-submit — the upload is never blocked.
 */
export const useVideoDraft = ({
  form,
  preGeneratedId,
  isEditMode,
  getArtistDetails,
}: UseVideoDraftArgs): UseVideoDraftResult => {
  const [draftId, setDraftId] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const handleUploadComplete = useCallback((): void => {
    if (isEditMode || draftId !== null || inFlightRef.current) return;
    inFlightRef.current = true;
    void (async () => {
      try {
        const result = await createVideoDraftAction(
          buildDraftInput(form.getValues(), preGeneratedId, getArtistDetails())
        );
        if (result.success) {
          setDraftId(result.videoId);
          globalThis.history.replaceState(null, '', `/admin/videos/${result.videoId}`);
        }
      } catch {
        // Degrade silently — the server action logs; create-on-submit still works.
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [isEditMode, draftId, form, preGeneratedId, getArtistDetails]);

  return { draftId, handleUploadComplete };
};
