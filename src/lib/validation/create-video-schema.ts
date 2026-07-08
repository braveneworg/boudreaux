/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { VIDEO_ALLOWED_MIME_TYPES } from '@/lib/constants/video-uploads';

/**
 * Whether a numeric-ish form field holds a positive whole number. `undefined`
 * and `''` are tolerated (optional fields). Accepts both the raw string a form
 * submits and the number `getActionState` coerces numeric strings into before
 * validation, so pure-numeric fields survive that coercion (a plain `z.string()`
 * would not — the coerced number would fail the string check).
 */
const isOptionalPositiveInteger = (value: string | number | undefined): boolean => {
  if (value === undefined || value === '') return true;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(num) && num > 0;
};

/**
 * Base shape shared by the create-video form (Task 10's RHF form) and the create
 * Server Action. Mirrors `releaseBaseSchema`: required scalars, empty-string
 * tolerant optionals, and the numeric-ish `durationSeconds` / `fileSize` carried
 * as strings through `FormData` then coerced in the action.
 */
export const videoFormSchema = z.object({
  title: z
    .string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title must be less than 200 characters' }),
  artist: z
    .string()
    .min(1, { message: 'Artist is required' })
    .max(200, { message: 'Artist must be less than 200 characters' }),
  category: z.enum(['MUSIC', 'INFORMATIONAL'], {
    message: 'Category must be MUSIC or INFORMATIONAL',
  }),
  description: z
    .string()
    .max(2000, { message: 'Description must be less than 2000 characters' })
    .optional()
    .or(z.literal('')),
  releasedOn: z.string().min(1, { message: 'Release date is required' }),
  durationSeconds: z.union([z.string(), z.number()]).optional().refine(isOptionalPositiveInteger, {
    message: 'Duration must be a positive whole number of seconds',
  }),
  s3Key: z.string().min(1, { message: 'Video file is required' }),
  fileName: z.string().min(1, { message: 'File name is required' }),
  fileSize: z.union([z.string(), z.number()]).optional().refine(isOptionalPositiveInteger, {
    message: 'File size must be a positive whole number of bytes',
  }),
  mimeType: z.enum(VIDEO_ALLOWED_MIME_TYPES, {
    message: 'Only MP4 and WebM videos are supported',
  }),
  posterUrl: z.string().url({ message: 'Poster must be a valid URL' }).optional().or(z.literal('')),
  publishedAt: z.string().optional().or(z.literal('')),
});

/**
 * Action input for `createVideoAction`. Videos have no cross-field refinement
 * (unlike releases, which require at least one artist), so this is the base
 * shape unchanged. The pre-generated ObjectId is read raw from the payload by
 * the action rather than carried here.
 */
export const createVideoSchema = videoFormSchema;

type schemaType = typeof createVideoSchema & Partial<FormData>;
export type VideoFormData = z.infer<schemaType>;
