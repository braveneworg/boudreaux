/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import {
  FORMAT_SIZE_LIMITS,
  FORMAT_MIME_TYPES,
  FORMAT_TOTAL_SIZE_LIMITS,
  MAX_TRACKS_PER_FORMAT,
} from '@/lib/constants/digital-formats';

/**
 * Create a MIME type schema that accepts known MIME types OR an empty string.
 * Browsers may report an empty MIME type for files selected via folder picker.
 */
function mimeTypeSchema(mimeTypes: readonly [string, ...string[]], errorMessage: string) {
  return z.union([z.literal(''), z.enum(mimeTypes, { message: errorMessage })]);
}

/**
 * Base schema for digital format fields common to all formats
 */
const baseDigitalFormatSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  mimeType: z.string(),
});

/**
 * Format-specific validation schemas using discriminated union
 * Each format has its own size limit and MIME type constraints
 */

const mp3V0Schema = baseDigitalFormatSchema.extend({
  formatType: z.literal('MP3_V0'),
  fileSize: z
    .number()
    .positive()
    .max(
      FORMAT_SIZE_LIMITS.MP3_V0,
      `MP3 V0 track file size must not exceed ${Math.round(FORMAT_SIZE_LIMITS.MP3_V0 / (1024 * 1024))} MB`
    ),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.MP3_V0,
    `MIME type must be ${FORMAT_MIME_TYPES.MP3_V0.join(' or ')}`
  ),
});

const mp3Schema = baseDigitalFormatSchema.extend({
  formatType: z.literal('MP3_320KBPS'),
  fileSize: z
    .number()
    .positive()
    .max(
      FORMAT_SIZE_LIMITS.MP3_320KBPS,
      `MP3 track file size must not exceed ${Math.round(FORMAT_SIZE_LIMITS.MP3_320KBPS / (1024 * 1024))} MB`
    ),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.MP3_320KBPS,
    `MIME type must be ${FORMAT_MIME_TYPES.MP3_320KBPS.join(' or ')}`
  ),
});

const aacSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('AAC'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.AAC, `AAC track file size must not exceed 50 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.AAC,
    `MIME type must be ${FORMAT_MIME_TYPES.AAC.join(' or ')}`
  ),
});

const oggVorbisSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('OGG_VORBIS'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.OGG_VORBIS, `Ogg Vorbis track file size must not exceed 50 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.OGG_VORBIS,
    `MIME type must be ${FORMAT_MIME_TYPES.OGG_VORBIS.join(' or ')}`
  ),
});

const flacSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('FLAC'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.FLAC, `FLAC track file size must not exceed 150 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.FLAC,
    `MIME type must be ${FORMAT_MIME_TYPES.FLAC.join(' or ')}`
  ),
});

const alacSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('ALAC'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.ALAC, `ALAC track file size must not exceed 150 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.ALAC,
    `MIME type must be ${FORMAT_MIME_TYPES.ALAC.join(' or ')}`
  ),
});

const wavSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('WAV'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.WAV, `WAV track file size must not exceed 300 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.WAV,
    `MIME type must be ${FORMAT_MIME_TYPES.WAV.join(' or ')}`
  ),
});

const aiffSchema = baseDigitalFormatSchema.extend({
  formatType: z.literal('AIFF'),
  fileSize: z
    .number()
    .positive()
    .max(FORMAT_SIZE_LIMITS.AIFF, `AIFF track file size must not exceed 300 MB`),
  mimeType: mimeTypeSchema(
    FORMAT_MIME_TYPES.AIFF,
    `MIME type must be ${FORMAT_MIME_TYPES.AIFF.join(' or ')}`
  ),
});

/**
 * Discriminated union schema for upload validation
 * Validates file info based on formatType-specific rules
 */
export const digitalFormatUploadSchema = z.discriminatedUnion('formatType', [
  mp3V0Schema,
  mp3Schema,
  aacSchema,
  oggVorbisSchema,
  flacSchema,
  alacSchema,
  wavSchema,
  aiffSchema,
]);

/**
 * Schema for confirming upload after S3 transfer
 * Includes releaseId and s3Key in addition to file metadata
 */
export const digitalFormatConfirmationSchema = z
  .discriminatedUnion('formatType', [
    mp3V0Schema,
    mp3Schema,
    aacSchema,
    oggVorbisSchema,
    flacSchema,
    alacSchema,
    wavSchema,
    aiffSchema,
  ])
  .and(
    z.object({
      releaseId: z.string().min(1, 'Release ID is required'),
      s3Key: z.string().min(1, 'S3 key is required'),
    })
  );

/**
 * Type exports inferred from schemas
 */
export type DigitalFormatUploadInput = z.infer<typeof digitalFormatUploadSchema>;
export type DigitalFormatConfirmation = z.infer<typeof digitalFormatConfirmationSchema>;

/**
 * Schema for confirming a multi-track upload (multiple files for one format)
 */
export const multiTrackConfirmationSchema = z
  .object({
    releaseId: z.string().min(1, 'Release ID is required'),
    formatType: z.enum([
      'MP3_V0',
      'MP3_320KBPS',
      'AAC',
      'OGG_VORBIS',
      'FLAC',
      'ALAC',
      'WAV',
      'AIFF',
    ]),
    files: z
      .array(
        z.object({
          trackNumber: z.number().int().positive('Track number must be a positive integer'),
          s3Key: z.string().min(1, 'S3 key is required'),
          fileName: z.string().min(1, 'File name is required'),
          fileSize: z.number().positive('File size must be positive'),
          mimeType: z.string(),
          title: z.string().optional(),
          duration: z.number().int().optional(),
        })
      )
      .min(1, 'At least one file is required')
      .max(MAX_TRACKS_PER_FORMAT, `Maximum ${MAX_TRACKS_PER_FORMAT} tracks per format`),
  })
  .superRefine((data, ctx) => {
    const totalSize = data.files.reduce((sum, f) => sum + f.fileSize, 0);
    if (totalSize > FORMAT_TOTAL_SIZE_LIMITS[data.formatType]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Total file size exceeds the ${Math.floor(FORMAT_TOTAL_SIZE_LIMITS[data.formatType] / (1024 * 1024 * 1024))} GB limit for ${data.formatType}`,
      });
    }
  });

export type MultiTrackConfirmation = z.infer<typeof multiTrackConfirmationSchema>;
