/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VIDEO_ALLOWED_MIME_TYPES, VIDEO_MAX_FILE_SIZE } from '@/lib/constants/video-uploads';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import type { ExtractedVideoTags } from './video-metadata';
import type { DefaultValues, UseFormReturn } from 'react-hook-form';

/** Human-readable maximum video size, used in the client-side size guard message. */
const VIDEO_MAX_FILE_SIZE_LABEL = `${VIDEO_MAX_FILE_SIZE / 1024 ** 3} GB`;

/** Format a Date/ISO value into the `YYYY-MM-DD` a date field expects. */
export const formatDateForForm = (dateValue: string | Date | null | undefined): string => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

/**
 * Create-mode default form values. `category` and `mimeType` are intentionally
 * left undefined so the required-field errors surface on an empty submit; the
 * numeric-ish fields default to empty strings so their inputs stay controlled.
 */
export const buildVideoDefaults = (): DefaultValues<VideoFormData> => ({
  title: '',
  artist: '',
  description: '',
  releasedOn: '',
  durationSeconds: '',
  s3Key: '',
  fileName: '',
  fileSize: '',
  posterUrl: '',
  publishedAt: '',
});

/** Project a loaded video row into the form's default values (pure mapping). */
export const mapVideoToFormValues = (video: VideoRow): VideoFormData => ({
  title: video.title,
  artist: video.artist,
  category: video.category,
  description: video.description ?? '',
  releasedOn: formatDateForForm(video.releasedOn),
  durationSeconds: video.durationSeconds == null ? '' : String(video.durationSeconds),
  s3Key: video.s3Key,
  fileName: video.fileName,
  fileSize: video.fileSize == null ? '' : String(video.fileSize),
  mimeType: video.mimeType as VideoFormData['mimeType'],
  posterUrl: video.posterUrl ?? '',
  publishedAt: formatDateForForm(video.publishedAt),
});

/**
 * Pre-populate title/artist/releasedOn/durationSeconds from a freshly-selected
 * file — but only where the admin has left the field empty, so an edit (or a
 * value they already typed) is never clobbered.
 */
export const applyVideoPrefill = (
  form: UseFormReturn<VideoFormData>,
  tags: ExtractedVideoTags,
  duration: number | undefined
): void => {
  const values = form.getValues();
  const setIfEmpty = (
    name: 'title' | 'artist' | 'releasedOn',
    current: string | undefined,
    value: string | undefined
  ): void => {
    if (!current && value) {
      form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
    }
  };
  setIfEmpty('title', values.title, tags.title);
  setIfEmpty('artist', values.artist, tags.artist);
  setIfEmpty('releasedOn', values.releasedOn, tags.releasedOn);
  if (!values.durationSeconds && duration !== undefined) {
    form.setValue('durationSeconds', String(duration), { shouldDirty: true, shouldValidate: true });
  }
};

/** Client-side guard for a selected video file; returns an error string or null. */
export const validateVideoFile = (file: File): string | null => {
  if (!(VIDEO_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Only MP4 and WebM videos are supported';
  }
  if (file.size > VIDEO_MAX_FILE_SIZE) {
    return `This video exceeds the maximum size of ${VIDEO_MAX_FILE_SIZE_LABEL}`;
  }
  return null;
};

/** Copy server-side field errors from a FormState onto the RHF form for inline display. */
export const applyServerFieldErrors = (
  setError: UseFormReturn<VideoFormData>['setError'],
  errors: Record<string, string[]> | undefined
): void => {
  if (!errors) return;
  for (const [field, messages] of Object.entries(errors)) {
    if (field !== 'general' && messages && messages.length > 0) {
      setError(field as keyof VideoFormData, { type: 'server', message: messages[0] });
    }
  }
};
