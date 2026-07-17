/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from 'sonner';

import {
  uploadVideoMultipart,
  type MultipartUploadFailure,
  type MultipartUploadSuccess,
} from '@/lib/utils/multipart-upload';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { applyVideoPrefill, validateVideoFile } from './video-form-helpers';
import { captureVideoPoster, extractVideoDuration, extractVideoTags } from './video-metadata';

import type { UseFormReturn } from 'react-hook-form';

/** Lifecycle of the multipart video upload the form drives. */
export type VideoUploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UseVideoUploadArgs {
  preGeneratedId: string;
  form: UseFormReturn<VideoFormData>;
  /** Receives the poster frame captured from a freshly-selected file (or null). */
  onPosterCandidate: (poster: Blob | null) => void;
  /** Fired once after the hidden fields are written on a successful upload. */
  onUploadComplete?: () => void;
}

export interface UseVideoUploadResult {
  status: VideoUploadStatus;
  /** Upload completion percentage, 0..100. */
  progress: number;
  errorMessage: string | null;
  selectFile: (file: File) => void;
  cancel: () => void;
  retry: () => void;
}

interface ApplyResultDeps {
  form: UseFormReturn<VideoFormData>;
  setStatus: (status: VideoUploadStatus) => void;
  setErrorMessage: (message: string | null) => void;
  onUploadComplete?: () => void;
}

/** Write the hidden fields the create/update schema requires from a successful upload. */
const writeUploadedFields = (
  form: UseFormReturn<VideoFormData>,
  result: MultipartUploadSuccess,
  file: File
): void => {
  form.setValue('s3Key', result.s3Key, { shouldDirty: true, shouldValidate: true });
  form.setValue('fileName', file.name, { shouldDirty: true, shouldValidate: true });
  form.setValue('fileSize', String(result.fileSize), { shouldDirty: true });
  form.setValue('mimeType', file.type as VideoFormData['mimeType'], {
    shouldDirty: true,
    shouldValidate: true,
  });
};

/** Fold a settled multipart result into the upload status/hidden-field state. */
const applyUploadResult = (
  result: MultipartUploadSuccess | MultipartUploadFailure,
  file: File,
  { form, setStatus, setErrorMessage, onUploadComplete }: ApplyResultDeps
): void => {
  if (result.success) {
    writeUploadedFields(form, result, file);
    setStatus('success');
    onUploadComplete?.();
    return;
  }
  if (result.aborted) {
    setStatus('idle');
    toast.info('Upload canceled — pick a video file to try again.');
    return;
  }
  setStatus('error');
  setErrorMessage(result.error);
};

/**
 * Owns the select → prefill → multipart-upload state machine for the admin video
 * form. On select it fans out metadata extraction + poster capture (best-effort,
 * only-empty prefill), then streams the file to S3 with progress, cancel, and
 * retry. On success it writes the hidden video fields the schema requires.
 */
export const useVideoUpload = ({
  preGeneratedId,
  form,
  onPosterCandidate,
  onUploadComplete,
}: UseVideoUploadArgs): UseVideoUploadResult => {
  const [status, setStatus] = useState<VideoUploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const lastFileRef = useRef<File | null>(null);

  // Abort any in-flight upload when the form unmounts (e.g. navigating away),
  // so the XHR pool is cancelled and the best-effort abort action frees the
  // partial multipart object instead of stranding a multi-GB orphan.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const startUpload = useCallback(
    async (file: File): Promise<void> => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setStatus('uploading');
      setProgress(0);
      setErrorMessage(null);
      const result = await uploadVideoMultipart(file, {
        videoId: preGeneratedId,
        onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
        signal: controller.signal,
      });
      applyUploadResult(result, file, { form, setStatus, setErrorMessage, onUploadComplete });
    },
    [preGeneratedId, form, onUploadComplete]
  );

  const runSelect = useCallback(
    async (file: File): Promise<void> => {
      const [duration, tags, poster] = await Promise.all([
        extractVideoDuration(file),
        extractVideoTags(file),
        captureVideoPoster(file),
      ]);
      applyVideoPrefill(form, tags, duration);
      onPosterCandidate(poster);
      await startUpload(file);
    },
    [form, onPosterCandidate, startUpload]
  );

  const selectFile = useCallback(
    (file: File): void => {
      const validationError = validateVideoFile(file);
      if (validationError) {
        setStatus('error');
        setErrorMessage(validationError);
        return;
      }
      lastFileRef.current = file;
      void runSelect(file);
    },
    [runSelect]
  );

  const cancel = useCallback((): void => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback((): void => {
    if (lastFileRef.current) void startUpload(lastFileRef.current);
  }, [startUpload]);

  return { status, progress, errorMessage, selectFile, cancel, retry };
};
