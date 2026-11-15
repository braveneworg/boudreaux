/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { gateAction } from '@/lib/auth/action-gate';
import { COMMUNITY_PATH } from '@/lib/community/community-paths';
import { ATTACHMENT_UPLOAD_LIMIT, attachmentUploadLimiter } from '@/lib/config/rate-limit-tiers';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import { SubmissionAttachmentService } from '@/lib/services/submission-attachment-service';
import type { SubmissionActionResult } from '@/lib/types/domain/submission';
import type {
  AttachmentUploadTarget,
  ConfirmedAttachment,
} from '@/lib/types/domain/submission-attachment';
import { allowAttachmentUpload } from '@/lib/utils/submission-allowances';
import {
  confirmAttachmentUploadSchema,
  removeAttachmentSchema,
  requestAttachmentUploadSchema,
} from '@/lib/validation/submission-attachment-schema';

import {
  COMMUNITY_MINE_PATH,
  COMMUNITY_QUEUE_PATH,
  failureFromError,
  invalidInputFailure,
} from './submission-action-helpers';

/**
 * Server Actions for a submission's attachments (ADR-0026, ADR-0027). Each
 * one crosses the action gate as `'signed-in'` in its own body, validates
 * the wire shape and maps a failure; every rule is the attachment service's.
 *
 * An upload is three steps: ask for somewhere to put the file, `PUT` it there
 * from the browser, then confirm it. No file ever passes through the app.
 */

const REQUEST_FAILED = 'We could not start that upload. Please try again.';
const CONFIRM_FAILED = 'We could not add that file. Please try again.';
const REMOVE_FAILED = 'We could not remove that attachment. Please try again.';
const RATE_LIMITED_MESSAGE = 'That is a lot of uploads at once. Wait a minute and try again.';
const DAILY_LIMIT_MESSAGE = 'You have added a lot of files today. Try again tomorrow.';

/**
 * Every page a change to one submission's attachments may have changed. The
 * community page is among them: an attachment added to or removed from an
 * approved submission takes it offline. A submission has no page of its own
 * to revalidate (ADR-0030): the modal reads it on opening.
 */
const revalidateSubmission = (): void => {
  revalidatePath(COMMUNITY_MINE_PATH);
  revalidatePath(COMMUNITY_QUEUE_PATH);
  revalidatePath(COMMUNITY_PATH);
};

/**
 * Ask for somewhere to upload one file to a submission the caller owns. The
 * answer is a presigned URL that accepts exactly the declared size and type.
 * Rate-limited per user, by the minute and by the day.
 */
export const requestAttachmentUploadAction = async (
  input: unknown
): Promise<SubmissionActionResult<AttachmentUploadTarget>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  const { user } = gate.session;

  const parsed = requestAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    await attachmentUploadLimiter.check(ATTACHMENT_UPLOAD_LIMIT, user.id);
  } catch {
    return { success: false, error: RATE_LIMITED_MESSAGE, code: 'LIMIT_EXCEEDED' };
  }

  // Every upload runs a re-encode, so the day's allowance is what bounds
  // what one account can cost there.
  if (!(await allowAttachmentUpload(user.id))) {
    return { success: false, error: DAILY_LIMIT_MESSAGE, code: 'LIMIT_EXCEEDED' };
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

  const parsed = confirmAttachmentUploadSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const { attachmentId, submission } = await SubmissionAttachmentService.confirmUpload(
      user.id,
      parsed.data
    );
    after(() => SubmissionAttachmentService.runReencode(attachmentId));
    revalidateSubmission();

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

  const parsed = removeAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const submission = await SubmissionAttachmentService.remove(user.id, parsed.data.attachmentId);
    revalidateSubmission();

    return { success: true, data: { status: submission.status } };
  } catch (error) {
    return failureFromError(error, REMOVE_FAILED);
  }
};
