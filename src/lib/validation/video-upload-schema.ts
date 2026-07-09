/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import {
  VIDEO_ALLOWED_MIME_TYPES,
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MAX_PARTS,
  VIDEO_PART_URL_BATCH_MAX,
} from '@/lib/constants/video-uploads';

/** 24-character hex MongoDB ObjectId, matching the repo-wide convention. */
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid video id');

const s3Key = z.string().min(1, 'S3 key is required');
const uploadId = z.string().min(1, 'Upload id is required');

/**
 * Input for `initiateVideoUploadAction`. `contentType` is a strict enum so a
 * `.mov` / `video/quicktime` file is rejected with a message naming the
 * supported formats rather than a generic enum error.
 */
export const initiateVideoUploadSchema = z.object({
  videoId: objectId,
  fileName: z.string().min(1, 'File name is required').max(255, 'File name is too long'),
  contentType: z.enum(VIDEO_ALLOWED_MIME_TYPES, {
    message: 'Only MP4 and WebM videos are supported',
  }),
  fileSize: z
    .number()
    .int('File size must be a whole number of bytes')
    .positive('File size must be greater than zero')
    .max(VIDEO_MAX_FILE_SIZE, 'File exceeds the 5 GB maximum'),
});

export type InitiateVideoUploadInput = z.infer<typeof initiateVideoUploadSchema>;

/** Input for `presignVideoPartsAction` — a just-in-time batch of part numbers. */
export const presignVideoPartsSchema = z.object({
  s3Key,
  uploadId,
  partNumbers: z
    .array(z.number().int('Part number must be an integer').min(1).max(VIDEO_MAX_PARTS))
    .min(1, 'At least one part number is required')
    .max(VIDEO_PART_URL_BATCH_MAX, 'Too many part numbers requested'),
});

export type PresignVideoPartsInput = z.infer<typeof presignVideoPartsSchema>;

/** Input for `completeVideoUploadAction` — the uploaded parts and their ETags. */
export const completeVideoUploadSchema = z.object({
  s3Key,
  uploadId,
  parts: z
    .array(
      z.object({
        partNumber: z.number().int('Part number must be an integer').min(1),
        eTag: z.string().min(1, 'ETag is required'),
      })
    )
    .min(1, 'At least one part is required')
    .max(VIDEO_MAX_PARTS, 'Too many parts'),
});

export type CompleteVideoUploadInput = z.infer<typeof completeVideoUploadSchema>;

/** Input for `abortVideoUploadAction`. */
export const abortVideoUploadSchema = z.object({ s3Key, uploadId });

export type AbortVideoUploadInput = z.infer<typeof abortVideoUploadSchema>;
