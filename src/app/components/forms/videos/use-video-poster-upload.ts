/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { UseFormSetValue } from 'react-hook-form';

interface UseVideoPosterUploadArgs {
  preGeneratedId: string;
  setValue: UseFormSetValue<VideoFormData>;
}

export interface UseVideoPosterUploadResult {
  /** CDN URL of a poster uploaded this session (highest display priority). */
  uploadedPosterUrl: string | null;
  isUploading: boolean;
  errorMessage: string | null;
  uploadPoster: (file: File) => Promise<void>;
}

/**
 * Presign-and-PUT flow for a video poster image. Replace-only: a success writes
 * the hidden `posterUrl` field and remembers the CDN URL; a failure leaves the
 * existing value untouched and surfaces an inline message. There is deliberately
 * no clear/remove operation.
 */
export const useVideoPosterUpload = ({
  preGeneratedId,
  setValue,
}: UseVideoPosterUploadArgs): UseVideoPosterUploadResult => {
  const [uploadedPosterUrl, setUploadedPosterUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uploadPoster = useCallback(
    async (file: File): Promise<void> => {
      setIsUploading(true);
      setErrorMessage(null);
      try {
        const presigned = await getPresignedUploadUrlsAction('videos', preGeneratedId, [
          { fileName: file.name, contentType: file.type, fileSize: file.size },
        ]);
        const target = presigned.success ? presigned.data?.[0] : undefined;
        if (!target) {
          setErrorMessage(presigned.error ?? 'Failed to prepare the poster upload.');
          return;
        }
        const result = await uploadFileToS3(file, target);
        if (!result.success) {
          setErrorMessage(result.error ?? 'Failed to upload the poster.');
          return;
        }
        setValue('posterUrl', result.cdnUrl, { shouldDirty: true, shouldValidate: true });
        setUploadedPosterUrl(result.cdnUrl);
      } finally {
        setIsUploading(false);
      }
    },
    [preGeneratedId, setValue]
  );

  return { uploadedPosterUrl, isUploading, errorMessage, uploadPoster };
};
