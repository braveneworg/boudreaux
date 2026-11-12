/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  attachmentUploadKey,
  REENCODE_PROGRESS_STAGES,
  submissionReencodeCallbackSchema,
  submissionReencodeProgressPostSchema,
} from '@fakefour/job-contract';
import { z } from 'zod';

import { objectId } from './primitives';

/**
 * Wire schemas for a submission's attachments (ADR-0026). They bound what
 * arrives; which types and sizes are accepted, and who may attach to what,
 * belong to the attachment service. The callback and progress bodies are
 * single-sourced in `@fakefour/job-contract`, which the Lambda shares.
 */
export { submissionReencodeCallbackSchema, submissionReencodeProgressPostSchema };

/** The longest file name kept for an attachment. */
export const ATTACHMENT_FILE_NAME_MAX = 200;

const fileName = z.string().trim().min(1, 'A file needs a name').max(ATTACHMENT_FILE_NAME_MAX);

/** What the form sends to ask for somewhere to upload one file. */
export const requestAttachmentUploadSchema = z.object({
  submissionId: objectId,
  fileName,
  contentType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export type RequestAttachmentUploadInput = z.infer<typeof requestAttachmentUploadSchema>;

/** What the form sends once the browser has uploaded the file. */
export const confirmAttachmentUploadSchema = z.object({
  submissionId: objectId,
  uploadKey: attachmentUploadKey,
  fileName,
});

export type ConfirmAttachmentUploadInput = z.infer<typeof confirmAttachmentUploadSchema>;

/** What the form sends to remove one attachment. */
export const removeAttachmentSchema = z.object({ attachmentId: objectId });

/** A stored re-encode checkpoint: the posted one plus the server's stamp. */
export const attachmentProgressSchema = z.object({
  stage: z.enum(REENCODE_PROGRESS_STAGES),
  percent: z.number().int().min(0).max(100).optional(),
  at: z.string(),
});
