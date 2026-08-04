/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState } from 'react';

import { createVideoDraftAction } from '@/lib/actions/create-video-draft-action';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';

import type { UseFormReturn } from 'react-hook-form';

/** Poster fields resolved from the candidate fan-out at draft time. */
export interface DraftPosterFields {
  posterUrl?: string;
  posterCandidates?: VideoPosterCandidate[];
}

interface UseVideoDraftArgs {
  form: UseFormReturn<VideoFormData>;
  preGeneratedId: string;
  isEditMode: boolean;
  getArtistDetails: () => VideoArtistDetail[];
  getPosterFields: () => Promise<DraftPosterFields>;
}

export interface UseVideoDraftResult {
  draftId: string | null;
  handleUploadComplete: () => void;
}

/** Poster subset of the draft payload — each field spread only when present. */
const buildPosterDraftFields = (posterFields: DraftPosterFields): Record<string, unknown> => ({
  ...(posterFields.posterCandidates?.length
    ? { posterCandidates: posterFields.posterCandidates }
    : {}),
  ...(posterFields.posterUrl ? { posterUrl: posterFields.posterUrl } : {}),
});

/** Snapshot the in-progress form into the lenient draft payload. */
const buildDraftInput = (
  values: VideoFormData,
  preGeneratedId: string,
  artistDetails: VideoArtistDetail[],
  posterFields: DraftPosterFields
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
  ...buildPosterDraftFields(posterFields),
});

/**
 * Owns the draft-at-upload-complete transition: snapshot the current form
 * values (corrections made during the upload ride along), await the settled
 * poster-candidate fan-out, create the unpublished draft row carrying that
 * captured poster set, then swap the URL to the edit route WITHOUT navigating
 * (history.replaceState keeps the mounted form alive; a refresh resumes on
 * the edit page). On success, a resolved `posterUrl` is written back into RHF
 * with `shouldDirty: false` so the Save-time fallback sees the field as
 * already-set and never re-uploads the blob. A failed draft leaves `draftId`
 * null and the form silently falls back to create-on-submit — the upload is
 * never blocked, and abandoning after upload leaves a poster-bearing draft.
 */
export const useVideoDraft = ({
  form,
  preGeneratedId,
  isEditMode,
  getArtistDetails,
  getPosterFields,
}: UseVideoDraftArgs): UseVideoDraftResult => {
  const [draftId, setDraftId] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const handleUploadComplete = useCallback((): void => {
    if (isEditMode || draftId !== null || inFlightRef.current) return;
    inFlightRef.current = true;
    void (async () => {
      try {
        const posterFields = await getPosterFields();
        const result = await createVideoDraftAction(
          buildDraftInput(form.getValues(), preGeneratedId, getArtistDetails(), posterFields)
        );
        if (result.success) {
          if (posterFields.posterUrl) {
            form.setValue('posterUrl', posterFields.posterUrl, { shouldDirty: false });
          }
          setDraftId(result.videoId);
          globalThis.history.replaceState(null, '', `/admin/videos/${result.videoId}`);
        }
      } catch {
        // Degrade silently — the server action logs; create-on-submit still works.
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [isEditMode, draftId, form, preGeneratedId, getArtistDetails, getPosterFields]);

  return { draftId, handleUploadComplete };
};
