/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VIDEO_ALLOWED_MIME_TYPES, VIDEO_MAX_FILE_SIZE } from '@/lib/constants/video-uploads';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';
import type { ProbePrefillTags } from '@/lib/video-probe/probe-tags';

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
 * Create-mode default form values. `mimeType` is intentionally left undefined
 * so the required-field error surfaces on an empty submit; the numeric-ish
 * fields default to empty strings so their inputs stay controlled.
 */
export const buildVideoDefaults = (): DefaultValues<VideoFormData> => ({
  title: '',
  artist: '',
  category: 'MUSIC',
  description: '',
  releasedOn: '',
  durationSeconds: '',
  s3Key: '',
  fileName: '',
  fileSize: '',
  posterUrl: '',
  publishedAt: '',
  producers: [],
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
 * file.
 *
 * Replacing a file (a new file swapped for one already uploaded in create mode,
 * or the stored file in edit mode) re-derives these file-driven details from the
 * new file, overwriting the previous values — replacing the file is a signal the
 * details should follow it. A first selection instead fills only blanks, so a
 * value the admin pre-typed is never clobbered. Either way a field is only ever
 * written when the new file actually yields a value, so a parse miss never wipes
 * an existing detail. The replace is detected from the already-present `s3Key`
 * (set on an edit-mode load and after the first successful upload).
 */
export const applyVideoPrefill = (
  form: UseFormReturn<VideoFormData>,
  tags: ExtractedVideoTags,
  duration: number | undefined
): void => {
  const values = form.getValues();
  const isReplace = Boolean(values.s3Key);
  const setField = (
    name: 'title' | 'artist' | 'releasedOn' | 'durationSeconds',
    current: string | number | undefined,
    value: string | undefined
  ): void => {
    if (!value || (!isReplace && current)) return;
    form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
  };
  setField('title', values.title, tags.title);
  setField('artist', values.artist, tags.artist);
  setField('releasedOn', values.releasedOn, tags.releasedOn);
  setField(
    'durationSeconds',
    values.durationSeconds,
    duration === undefined ? undefined : String(duration)
  );
};

/**
 * Merge server-probed ffprobe tags into the admin video form — only-if-empty,
 * so values the admin has already typed are never clobbered. Called after a
 * successful upload once the probe API returns.
 *
 * Unlike `applyVideoPrefill` (client-side file extractor), this helper also
 * fills `description` because ffprobe sees comment/description tags that the
 * client-side WebM/MP4 parser does not expose.
 */
export const applyServerProbePrefill = (
  form: UseFormReturn<VideoFormData>,
  tags: ProbePrefillTags
): void => {
  const values = form.getValues();
  const setIfEmpty = (
    name: 'title' | 'artist' | 'releasedOn' | 'description',
    current: string | undefined,
    value: string | null
  ): void => {
    if (!current && value) {
      form.setValue(name, value, { shouldDirty: true, shouldValidate: true });
    }
  };
  setIfEmpty('title', values.title, tags.title);
  setIfEmpty('artist', values.artist, tags.artist);
  setIfEmpty('releasedOn', values.releasedOn, tags.releasedOn);
  setIfEmpty('description', values.description, tags.description);
  if (!values.durationSeconds && tags.durationSeconds !== null) {
    form.setValue('durationSeconds', String(tags.durationSeconds), {
      shouldDirty: true,
      shouldValidate: true,
    });
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

/**
 * Shape the form payload before submission based on the user's intent.
 *
 * - `publish` → ensures `publishedAt` is set (stamps today if empty).
 * - `save` on a draft → strips `publishedAt` so a typed date can't accidentally
 *   publish the video.
 * - `save` on an already-published video → returns `data` unchanged so the
 *   admin can freely edit/correct the publish date.
 */
export const shapePublish = (
  data: VideoFormData,
  intent: 'save' | 'publish',
  isDraft: boolean
): VideoFormData => {
  if (intent === 'publish') {
    return { ...data, publishedAt: data.publishedAt || formatDateForForm(new Date()) };
  }
  return isDraft ? { ...data, publishedAt: '' } : data;
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
