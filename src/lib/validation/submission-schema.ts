/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import {
  MAX_SUBMISSION_LINKS,
  REJECTION_REASON_MAX,
  REJECTION_REASON_MIN,
  SUBMISSION_ABOUT_MAX,
  SUBMISSION_CATEGORIES,
  SUBMISSION_TITLE_MAX,
  SUBMISSION_WRITING_MAX,
} from '@/lib/constants/submissions';

import { httpUrl, objectId, username } from './primitives';
import { turnstileTokenSchema } from './turnstile-token-schema';

/**
 * Wire schemas for the submission Server Actions (ADR-0025). They bound what
 * arrives; the rules that need the sanitized text (the about and writing
 * length limits, the writing's links counted toward the ten) belong to the
 * submission service, which is the only place that sanitizes.
 */

/**
 * How much HTML a field may carry for each character of text it is allowed.
 * The text limit is the rule; this only stops a request from carrying
 * megabytes of markup to the sanitizer.
 */
const HTML_PER_TEXT_CHARACTER = 6;

/** The longest URL a link field accepts. */
const LINK_MAX = 2048;

const link = z.string().trim().max(LINK_MAX, 'That link is too long').pipe(httpUrl);

/**
 * What the submission form sends for Save draft and for Publish alike. A draft
 * may have an empty title; publishing needs one, which the service enforces.
 */
export const saveSubmissionInputSchema = z.object({
  /** Present when editing; absent when the save creates the submission. */
  submissionId: objectId.optional(),
  title: z
    .string()
    .trim()
    .max(SUBMISSION_TITLE_MAX, `Keep the title to ${SUBMISSION_TITLE_MAX} characters or fewer`),
  category: z.enum(SUBMISSION_CATEGORIES),
  aboutHtml: z.string().max(SUBMISSION_ABOUT_MAX * HTML_PER_TEXT_CHARACTER),
  writingHtml: z.string().max(SUBMISSION_WRITING_MAX * HTML_PER_TEXT_CHARACTER),
  links: z.array(link).max(MAX_SUBMISSION_LINKS, `Add at most ${MAX_SUBMISSION_LINKS} links`),
  listed: z.boolean(),
  /** True when the user ticked the upload agreement on this save. */
  acceptAgreement: z.boolean(),
  turnstileToken: turnstileTokenSchema,
});

export type SaveSubmissionInput = z.infer<typeof saveSubmissionInputSchema>;

/** Switch an approved submission between listed and unlisted. */
export const setSubmissionListedInputSchema = z.object({
  submissionId: objectId,
  listed: z.boolean(),
});

/** Name one submission, for a delete or a read. */
export const submissionIdInputSchema = z.object({ submissionId: objectId });

/**
 * The moment an approver's screen loaded the submission, as its `updatedAt`.
 * A decision is refused when the submission has changed since.
 */
const loadedUpdatedAt = z.iso.datetime();

/** Approve the submission as the approver saw it. */
export const approveSubmissionInputSchema = z.object({
  submissionId: objectId,
  loadedUpdatedAt,
});

/** Reject the submission as the approver saw it, with the reason its owner reads. */
export const rejectSubmissionInputSchema = z.object({
  submissionId: objectId,
  loadedUpdatedAt,
  reason: z
    .string()
    .trim()
    .min(REJECTION_REASON_MIN, `Give a reason of at least ${REJECTION_REASON_MIN} characters`)
    .max(REJECTION_REASON_MAX, `Keep the reason to ${REJECTION_REASON_MAX} characters or fewer`),
});

/** Name the user whose manager role an admin grants or removes. */
export const managerUsernameInputSchema = z.object({
  username: z.string().trim().pipe(username),
});
