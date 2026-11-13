/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import {
  REPORT_CONTACT_EMAIL_MAX,
  REPORT_NOTE_MAX,
  REPORT_OTHER_NOTE_MIN,
  SUBMISSION_REPORT_REASONS,
} from '@/lib/constants/submissions';
import { isValidEmailFormat } from '@/lib/utils/auth/auth-utils';

import { objectId } from './primitives';
import { turnstileTokenSchema } from './turnstile-token-schema';

/**
 * Wire schemas for submission reports (ADR-0025, ADR-0028). A report is filed
 * by anyone, signed in or not, so everything here is a stranger's input: a
 * reason from a closed list, a bounded plain-text note and an optional contact
 * email. The dialog imports this module, so it stays client-safe.
 */

const reason = z.enum(SUBMISSION_REPORT_REASONS, 'Choose a reason');

const note = z
  .string()
  .trim()
  .max(
    REPORT_NOTE_MAX,
    `Keep the note to ${REPORT_NOTE_MAX.toLocaleString('en-US')} characters or fewer`
  );

/** The contact email as its field holds it: empty when the reporter leaves none. */
const contactEmailText = z
  .string()
  .trim()
  .toLowerCase()
  .max(REPORT_CONTACT_EMAIL_MAX, 'That email address is too long')
  .refine((value) => value === '' || isValidEmailFormat(value), {
    message: 'Enter a valid email address, or leave this empty',
    // A too-long address has already been refused; one message is enough.
    when: ({ issues }) => issues.length === 0,
  });

/**
 * "Something else" says nothing by itself, so that reason needs a note an
 * approver can act on. The other two reasons stand on their own.
 */
const needsNote = (
  value: { reason: string; note: string },
  context: z.core.$RefinementCtx<{ reason: string; note: string }>
): void => {
  if (value.reason === 'OTHER' && value.note.length < REPORT_OTHER_NOTE_MIN) {
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: `Tell us what is wrong, in at least ${REPORT_OTHER_NOTE_MIN} characters`,
    });
  }
};

/** What the report dialog sends. `contactEmail` arrives as text and leaves as an address or `null`. */
export const fileSubmissionReportInputSchema = z
  .object({
    submissionId: objectId,
    reason,
    note: note.default(''),
    contactEmail: contactEmailText
      .optional()
      .transform((value) => (value === undefined || value === '' ? null : value)),
    turnstileToken: turnstileTokenSchema,
  })
  .superRefine(needsNote);

export type FileSubmissionReportInput = z.infer<typeof fileSubmissionReportInputSchema>;

/**
 * What the report dialog holds on the client: the report without the fields
 * the form does not own (the submission and the verification token). The
 * server validates again with {@link fileSubmissionReportInputSchema}.
 */
export const submissionReportFormSchema = z
  .object({ reason, note, contactEmail: contactEmailText })
  .superRefine(needsNote);

export type SubmissionReportFormInput = z.input<typeof submissionReportFormSchema>;
export type SubmissionReportFormValues = z.output<typeof submissionReportFormSchema>;

/** Name one report, for an approver marking it handled. */
export const submissionReportIdInputSchema = z.object({ reportId: objectId });
