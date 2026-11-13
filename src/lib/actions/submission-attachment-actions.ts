/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { gateAction } from '@/lib/auth/action-gate';
import { ATTACHMENT_UPLOAD_LIMIT, attachmentUploadLimiter } from '@/lib/config/rate-limit-tiers';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import { SubmissionAttachmentService } from '@/lib/services/submission-attachment-service';
import type { SubmissionActionResult } from '@/lib/types/domain/submission';
import type {
  AttachmentUploadTarget,
  ConfirmedAttachment,
} from '@/lib/types/domain/submission-attachment';
import {
  confirmAttachmentUploadSchema,
  removeAttachmentSchema,
  requestAttachmentUploadSchema,
} from '@/lib/validation/submission-attachment-schema';

import {
  communityClosedRefusal,
  COMMUNITY_MINE_PATH,
  COMMUNITY_QUEUE_PATH,
  failureFromError,
  invalidInputFailure,
  submissionPath,
} from './submission-action-helpers';

/**
 * Server Actions for a submission's attachments (ADR-0026, ADR-0027). Each
 * one crosses the action gate as `'signed-in'` in its own body and, until the
 * community page launches, is refused to anyone who is not an approver. They
 * validate the wire shape and map a failure; every rule is the attachment
 * service's.
 *
 * An upload is three steps: ask for somewhere to put the file, `PUT` it there
 * from the browser, then confirm it. No file ever passes through the app.
 */

const REQUEST_FAILED = 'We could not start that upload. Please try again.';
const CONFIRM_FAILED = 'We could not add that file. Please try again.';
const REMOVE_FAILED = 'We could not remove that attachment. Please try again.';
const RATE_LIMITED_MESSAGE = 'That is a lot of uploads at once. Wait a minute and try again.';

/** Every page a change to one submission's attachments may have changed. */
const revalidateSubmission = (id: string): void => {
  revalidatePath(COMMUNITY_MINE_PATH);
  revalidatePath(submissionPath(id));
  revalidatePath(COMMUNITY_QUEUE_PATH);
};

/**
 * Ask for somewhere to upload one file to a submission the caller owns. The
 * answer is a presigned URL that accepts exactly the declared size and type.
 * Rate-limited per user.
 */
export const requestAttachmentUploadAction = async (
  input: unknown
): Promise<SubmissionActionResult<AttachmentUploadTarget>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  const { user } = gate.session;
  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = requestAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    await attachmentUploadLimiter.check(ATTACHMENT_UPLOAD_LIMIT, user.id);
  } catch {
    return { success: false, error: RATE_LIMITED_MESSAGE, code: 'LIMIT_EXCEEDED' };
  }

  try {
    const target = await SubmissionAttachmentService.requestUpload(
      { id: user.id, uploadAgreementVersion: user.uploadAgreementVersion },
      parsed.data
    );

    return { success: true, data: target };
  } catch (error) {
    return failureFromError(error, REQUEST_FAILED);
  }
};

/**
 * Confirm a finished upload: it becomes an attachment, and its re-encode
 * starts once this response has been sent. On an approved submission this is
 * a content edit, so the submission goes back to awaiting approval.
 */
export const confirmAttachmentUploadAction = async (
  input: unknown
): Promise<SubmissionActionResult<ConfirmedAttachment>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  const { user } = gate.session;
  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = confirmAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const { attachmentId, submission } = await SubmissionAttachmentService.confirmUpload(
      user.id,
      parsed.data
    );
    after(() => SubmissionAttachmentService.runReencode(attachmentId));
    revalidateSubmission(submission.id);

    return { success: true, data: { attachmentId, status: submission.status } };
  } catch (error) {
    return failureFromError(error, CONFIRM_FAILED);
  }
};

/**
 * Remove one of the caller's attachments and its files. On an approved
 * submission this is a content edit, so the submission goes back to awaiting
 * approval.
 */
export const removeAttachmentAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ status: SubmissionStatus }>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  const { user } = gate.session;
  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = removeAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const submission = await SubmissionAttachmentService.remove(user.id, parsed.data.attachmentId);
    revalidateSubmission(submission.id);

    return { success: true, data: { status: submission.status } };
  } catch (error) {
    return failureFromError(error, REMOVE_FAILED);
  }
};
