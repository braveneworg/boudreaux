/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { jobSigningKey } from './job-signing-key';

/**
 * The wire contract for re-encoding a submission's attachment (ADR-0026): the
 * limits both sides enforce, where the files go, and the shapes the web app
 * and the re-encode Lambda exchange. Client-safe: the form reads the limits.
 */

/** The task name the re-encode Lambda's invoke payload carries. */
export const SUBMISSION_REENCODE_TASK = 'submission-reencode';

/** What an attachment can be. The re-encode decides; the upload's type only guesses. */
export const ATTACHMENT_KINDS = ['IMAGE', 'AUDIO', 'VIDEO'] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

const MEGABYTE = 1024 * 1024;

/** The largest upload accepted for each kind, in bytes. */
export const ATTACHMENT_UPLOAD_LIMIT_BYTES: Readonly<Record<AttachmentKind, number>> = {
  IMAGE: 20 * MEGABYTE,
  AUDIO: 50 * MEGABYTE,
  VIDEO: 500 * MEGABYTE,
};

/** The longest video accepted, in seconds. */
export const ATTACHMENT_MAX_VIDEO_SECONDS = 600;

/**
 * The longest audio accepted, in seconds. A guard, not a product limit: a
 * long file at a very low bitrate would otherwise be kept as a far larger MP3.
 */
export const ATTACHMENT_MAX_AUDIO_SECONDS = 10_800;

/** The longest side of a kept photo, in pixels. */
export const ATTACHMENT_IMAGE_MAX_EDGE = 2560;

/** The JPEG and WebP quality a kept picture is written at. */
export const ATTACHMENT_IMAGE_QUALITY = 70;

/** The short side of a kept video, in pixels ("720p"). */
export const ATTACHMENT_VIDEO_SHORT_SIDE = 720;

/** The width of a card picture, in pixels. */
export const ATTACHMENT_CARD_WIDTH = 640;

/** The largest upload accepted for a kind, in bytes. */
export const attachmentUploadLimitBytes = (kind: AttachmentKind): number => {
  switch (kind) {
    case 'IMAGE':
      return ATTACHMENT_UPLOAD_LIMIT_BYTES.IMAGE;
    case 'AUDIO':
      return ATTACHMENT_UPLOAD_LIMIT_BYTES.AUDIO;
    default:
      return ATTACHMENT_UPLOAD_LIMIT_BYTES.VIDEO;
  }
};

/** The upload types accepted for each kind, as a browser reports them. */
const UPLOAD_TYPES: ReadonlyArray<{ kind: AttachmentKind; types: readonly string[] }> = [
  {
    kind: 'IMAGE',
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff'],
  },
  {
    kind: 'AUDIO',
    types: [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/aac',
      'audio/wav',
      'audio/x-wav',
      'audio/wave',
      'audio/flac',
      'audio/x-flac',
      'audio/ogg',
      'audio/opus',
      'audio/aiff',
      'audio/x-aiff',
      'audio/webm',
    ],
  },
  {
    kind: 'VIDEO',
    types: [
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
      'video/x-msvideo',
      'video/x-m4v',
      'video/3gpp',
    ],
  },
];

/** Every accepted upload type, for a file picker's `accept`. */
export const ATTACHMENT_ACCEPTED_TYPES: readonly string[] = UPLOAD_TYPES.flatMap(
  ({ types }) => types
);

/** A content type without its parameters, lower-cased. */
const bareType = (contentType: string): string =>
  (contentType.split(';').at(0) ?? '').trim().toLowerCase();

/** The kind an upload's declared type stands for, or `null` when it is not accepted. */
export const attachmentKindForType = (contentType: string): AttachmentKind | null => {
  const type = bareType(contentType);

  return UPLOAD_TYPES.find(({ types }) => types.includes(type))?.kind ?? null;
};

/** The accepted type for each file extension a browser may leave untyped. */
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['avif', 'image/avif'],
  ['tif', 'image/tiff'],
  ['tiff', 'image/tiff'],
  ['mp3', 'audio/mpeg'],
  ['m4a', 'audio/mp4'],
  ['aac', 'audio/aac'],
  ['wav', 'audio/wav'],
  ['flac', 'audio/flac'],
  ['ogg', 'audio/ogg'],
  ['oga', 'audio/ogg'],
  ['opus', 'audio/opus'],
  ['aif', 'audio/aiff'],
  ['aiff', 'audio/aiff'],
  ['mp4', 'video/mp4'],
  ['m4v', 'video/x-m4v'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm'],
  ['mkv', 'video/x-matroska'],
  ['avi', 'video/x-msvideo'],
  ['3gp', 'video/3gpp'],
]);

/**
 * The accepted type a file's name stands for, or `null`. For a file whose
 * browser reported no type at all, which some do for `.mkv` and `.flac`.
 */
export const attachmentTypeForFileName = (fileName: string): string | null => {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) {
    return null;
  }

  return TYPE_BY_EXTENSION.get(fileName.slice(dot + 1).toLowerCase()) ?? null;
};

/**
 * The accepted type a file is uploaded as, or `null` when it is not accepted:
 * what its browser reported, else what its name says. This is the type that
 * is signed into the upload, so the browser must send exactly this string.
 */
export const acceptedAttachmentType = (reportedType: string, fileName: string): string | null => {
  const reported = bareType(reportedType);

  return attachmentKindForType(reported) === null ? attachmentTypeForFileName(fileName) : reported;
};

/** The stages a re-encode checkpoints through, in order. */
export const REENCODE_PROGRESS_STAGES = ['downloading', 'probing', 'encoding', 'storing'] as const;

export type ReencodeProgressStage = (typeof REENCODE_PROGRESS_STAGES)[number];

/** Why a re-encode refused a file. The web app maps each to the copy an owner reads. */
export const REENCODE_FAILURES = [
  'too-large',
  'too-long',
  'unreadable',
  'unsupported',
  'failed',
] as const;

export type ReencodeFailure = (typeof REENCODE_FAILURES)[number];

const UPLOADS_PREFIX = 'uploads/';
const COPIES_PREFIX = 'copies/';
const PUBLISHED_PREFIX = 'media/submissions/';

/** Where a submission's uploads land in the private bucket. */
export const attachmentUploadPrefix = (submissionId: string): string =>
  `${UPLOADS_PREFIX}${submissionId}/`;

/** Where one attachment's re-encoded files are written in the private bucket. */
export const attachmentCopyPrefix = (submissionId: string, attachmentId: string): string =>
  `${COPIES_PREFIX}${submissionId}/${attachmentId}/`;

/** Where every re-encoded file of a submission is written in the private bucket. */
export const submissionCopiesPrefix = (submissionId: string): string =>
  `${COPIES_PREFIX}${submissionId}/`;

/** Where a submission's published files sit in the media bucket. */
export const submissionPublishedPrefix = (submissionId: string): string =>
  `${PUBLISHED_PREFIX}${submissionId}/`;

/** The media-bucket key a private copy is published at (ADR-0027). */
export const publishedAttachmentKey = (copyKey: string): string =>
  `${PUBLISHED_PREFIX}${copyKey.slice(COPIES_PREFIX.length)}`;

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

/** An upload's key: under one submission, named by the app, never by the user. */
export const attachmentUploadKey = z
  .string()
  .regex(/^uploads\/[a-f0-9]{24}\/[A-Za-z0-9-]{8,64}$/, 'Invalid upload key');

const copyPrefix = z
  .string()
  .regex(/^copies\/[a-f0-9]{24}\/[a-f0-9]{24}\/$/, 'Invalid copy prefix');

// The files a re-encode writes: a fixed set of names under a copy prefix.
const copyKey = z
  .string()
  .regex(/^copies\/[a-f0-9]{24}\/[a-f0-9]{24}\/copy\.(?:jpg|mp3|mp4)$/, 'Invalid copy key');
const cardKey = z
  .string()
  .regex(/^copies\/[a-f0-9]{24}\/[a-f0-9]{24}\/card\.webp$/, 'Invalid card key');
const posterKey = z
  .string()
  .regex(/^copies\/[a-f0-9]{24}\/[a-f0-9]{24}\/poster\.jpg$/, 'Invalid poster key');

/** Invoke event the web app sends to the re-encode Lambda. */
export const submissionReencodeInputSchema = z.object({
  task: z.literal(SUBMISSION_REENCODE_TASK),
  attachmentId: objectId,
  /** What the upload's type said it is. */
  kind: z.enum(ATTACHMENT_KINDS),
  bucket: z.string().min(3).max(63),
  uploadKey: attachmentUploadKey,
  copyPrefix,
  callbackUrl: z.string().url().optional(),
  progressUrl: z.string().url().optional(),
  jobToken: z.string().min(1).max(200).optional(),
  signingKey: jobSigningKey.optional(),
});

export type SubmissionReencodeInput = z.infer<typeof submissionReencodeInputSchema>;

const dimension = z.number().int().positive().max(20_000);

/** What a successful re-encode wrote. */
export const submissionReencodeDataSchema = z.object({
  /** What the file turned out to be. */
  kind: z.enum(ATTACHMENT_KINDS),
  copyKey,
  cardKey: cardKey.nullable(),
  posterKey: posterKey.nullable(),
  copyBytes: z.number().int().positive(),
  width: dimension.nullable(),
  height: dimension.nullable(),
  durationSeconds: z.number().int().min(0).max(ATTACHMENT_MAX_AUDIO_SECONDS).nullable(),
});

export type SubmissionReencodeData = z.infer<typeof submissionReencodeDataSchema>;

/** Discriminated result envelope so the callback can branch cheaply. */
export const submissionReencodeResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: submissionReencodeDataSchema }),
  // A failure is one of REENCODE_FAILURES; anything else reads as `failed`.
  z.object({ ok: z.literal(false), error: z.string().max(200) }),
]);

export type SubmissionReencodeResult = z.infer<typeof submissionReencodeResultSchema>;

/** Body the Lambda POSTs to the completion callback route. */
export const submissionReencodeCallbackSchema = z.object({
  jobToken: z.string().min(1).max(200),
  result: submissionReencodeResultSchema,
});

export type SubmissionReencodeCallback = z.infer<typeof submissionReencodeCallbackSchema>;

/** Body the Lambda POSTs to the progress route. */
export const submissionReencodeProgressPostSchema = z.object({
  jobToken: z.string().min(1).max(200),
  stage: z.enum(REENCODE_PROGRESS_STAGES),
  /** How far through the stage, where the stage can tell. */
  percent: z.number().int().min(0).max(100).optional(),
});

export type SubmissionReencodeProgressPost = z.infer<typeof submissionReencodeProgressPostSchema>;
