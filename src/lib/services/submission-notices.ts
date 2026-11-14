/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { OVERDUE_BUSINESS_DAYS, submissionReportReasonPhrase } from '@/lib/constants/submissions';
import type { SubmissionReportReason } from '@/lib/constants/submissions';
import { sendSubmissionEmail } from '@/lib/email/send-submission-email';
import { buildSubmissionEmail, type SubmissionEmailMessage } from '@/lib/email/submission-email';
import { UserRepository } from '@/lib/repositories/user-repository';
import { getSmsService } from '@/lib/services/get-sms-service';
import type { SubmissionRecord, SubmissionWithOwnerRecord } from '@/lib/types/domain/submission';
import type { UserAdminRecord, UserApproverRecord } from '@/lib/types/domain/user';
import { loggers } from '@/lib/utils/logger';
import { isAdminRole } from '@/lib/utils/roles';

/**
 * The notices a submission's life sends (ADR-0025): to every approver when
 * one awaits approval or is reported, and to its owner when it is approved or
 * rejected. A notice names the title and links to the page; it never carries
 * the about or the writing, nor anything a reporter typed (ADR-0028). One
 * recipient's failure never stops another's, and the callers never let a
 * failed notice fail the write it follows.
 */

const logger = loggers.notifications;

const KICKER = 'Community submissions';

/** The approver section, where the queue is reviewed. */
const QUEUE_PATH = '/admin/community';

/** The approver section's tab of submissions that hold an open report. */
const REPORTED_PATH = `${QUEUE_PATH}?status=reported`;

const baseUrl = (): string => process.env.NEXT_PUBLIC_BASE_URL ?? 'https://fakefourrecords.com';

/** A link that signs the reader in first and then lands them on `path`. */
const signedInLink = (path: string): string =>
  `${baseUrl()}/signin?callbackUrl=${encodeURIComponent(path)}`;

const titleOf = ({ title }: { title: string }): string => (title === '' ? 'Untitled' : title);

/** A username, or the name in the address for an account that has none. */
const greetingFor = ({ username, email }: { username: string | null; email: string }): string =>
  username ?? email.split('@').at(0) ?? email;

const emailOne = async (toEmail: string, message: SubmissionEmailMessage): Promise<void> => {
  try {
    await sendSubmissionEmail({ toEmail, ...buildSubmissionEmail(message) });
  } catch (error) {
    logger.error(`[submission notices] email failed for ${toEmail}`, error);
  }
};

const textOne = async ({ id, phone }: UserAdminRecord, body: string): Promise<void> => {
  // Truthy-guard narrows `phone` to a non-null string for `send`. And never
  // text from an E2E run: a worktree's env files may name a live SMS provider.
  if (!phone || process.env.E2E_MODE === 'true') {
    return;
  }

  try {
    const result = await getSmsService().send(phone, body, { transactional: true });
    if (!result.ok) {
      logger.error(`[submission notices] SMS failed for approver ${id}: ${result.error}`);
    }
  } catch (error) {
    logger.error(`[submission notices] SMS threw for approver ${id}`, error);
  }
};

/** What every approver is told at once: the email, and the text for those who opted in. */
interface ApproverNotice extends Omit<SubmissionEmailMessage, 'kicker' | 'greetingName'> {
  smsBody: string;
}

/**
 * Email each approver and text those who opted in to SMS. The whole fan-out
 * is awaited, so a Server Action's runtime is not torn down mid-dispatch.
 */
const tellApprovers = async (
  approvers: UserApproverRecord[],
  { smsBody, ...message }: ApproverNotice
): Promise<void> => {
  await Promise.allSettled(
    approvers.map(async (approver) => {
      await Promise.all([
        emailOne(approver.email, {
          ...message,
          kicker: KICKER,
          greetingName: greetingFor(approver),
        }),
        approver.allowSmsNotifications ? textOne(approver, smsBody) : Promise.resolve(),
      ]);
    })
  );
};

/**
 * Tell every approver a submission is awaiting approval: an email to each,
 * and a text to those who opted in to SMS. The owner is left out when they
 * are an approver themselves.
 */
export const notifyApproversOfSubmission = async (submission: SubmissionRecord): Promise<void> => {
  const approvers = (await UserRepository.findApprovers()).filter(
    ({ id }) => id !== submission.ownerId
  );
  const title = titleOf(submission);

  await tellApprovers(approvers, {
    subject: `Awaiting approval: ${title}`,
    paragraphs: [
      'A submission is awaiting approval. Nobody else can open it until an approver has looked.',
    ],
    detail: { label: 'Title', value: title },
    action: { label: 'Review it', url: signedInLink(`${QUEUE_PATH}/${submission.id}`) },
    smsBody: `[boudreaux] A submission is awaiting approval: "${title}". Review: ${baseUrl()}${QUEUE_PATH}`,
  });
};

/**
 * Tell every approver a submission was reported: an email to each, and a text
 * to those who opted in to SMS. It takes the submission and a reason from the
 * closed list and nothing else, so no note and no contact email can be mailed
 * or texted to anyone (ADR-0028).
 *
 * A manager who owns the submission is left out: they cannot decide on it and
 * are not shown its reports. An admin who owns it is told, so a label with
 * one admin still hears.
 */
export const notifyApproversOfReport = async (
  submission: SubmissionRecord,
  reason: SubmissionReportReason
): Promise<void> => {
  const approvers = (await UserRepository.findApprovers()).filter(
    ({ id, role }) => id !== submission.ownerId || isAdminRole(role)
  );
  const title = titleOf(submission);
  const reportedAs = `reported as ${submissionReportReasonPhrase(reason)}`;

  await tellApprovers(approvers, {
    subject: `Reported: ${title}`,
    paragraphs: [
      `A submission was ${reportedAs}. It stays up unless an approver rejects it.`,
      'The report is on its review page. Mark it handled once you have looked.',
    ],
    detail: { label: 'Title', value: title },
    action: { label: 'Review it', url: signedInLink(`${QUEUE_PATH}/${submission.id}`) },
    smsBody: `[boudreaux] A submission was ${reportedAs}: "${title}". Review: ${baseUrl()}${REPORTED_PATH}`,
  });
};

/**
 * Remind every approver that submissions have waited longer than an owner is
 * told to expect. An email only: a daily reminder is not worth a text.
 *
 * @param overdue - How many submissions have waited too long; at least one.
 */
export const remindApproversOfOverdue = async (overdue: number): Promise<void> => {
  const approvers = await UserRepository.findApprovers();
  const counted = overdue === 1 ? '1 submission has waited' : `${overdue} submissions have waited`;
  const subject = `${counted} more than ${OVERDUE_BUSINESS_DAYS} business days`;

  await Promise.allSettled(
    approvers.map((approver) =>
      emailOne(approver.email, {
        subject,
        kicker: KICKER,
        greetingName: greetingFor(approver),
        paragraphs: [
          `${counted} for approval for more than ${OVERDUE_BUSINESS_DAYS} business days. Each owner was told to expect a reply in 2 to 5.`,
          'The queue lists the oldest first.',
        ],
        action: { label: 'Open the queue', url: signedInLink(QUEUE_PATH) },
      })
    )
  );
};

/** What the owner is told about each decision, or `null` for a state that is not one. */
const decisionMessageFor = (
  submission: SubmissionWithOwnerRecord
): SubmissionEmailMessage | null => {
  const title = titleOf(submission);
  const shared = {
    kicker: KICKER,
    greetingName: greetingFor(submission.owner),
    detail: { label: 'Title', value: title },
  };

  if (submission.status === 'APPROVED') {
    return {
      ...shared,
      subject: `Approved: ${title}`,
      paragraphs: [
        'Your submission is approved and live.',
        submission.listed
          ? 'It is listed, so it is shown with the other user submitted content.'
          : 'It is unlisted, so only people with the link can open it.',
      ],
      action: { label: 'Open it', url: `${baseUrl()}/community/${submission.id}` },
    };
  }

  if (submission.status === 'REJECTED') {
    return {
      ...shared,
      subject: `Changes needed: ${title}`,
      paragraphs: [
        'Your submission was not approved, so it is offline for now.',
        `Reason: ${submission.rejectionReason ?? 'No reason was recorded.'}`,
        'You can edit it and publish it again.',
      ],
      action: { label: 'Edit it', url: signedInLink(`/community/${submission.id}/edit`) },
    };
  }

  return null;
};

/**
 * Tell a submission's owner it was approved or rejected; a rejection carries
 * the reason and a link back to the form. Sends nothing for any other state.
 */
export const notifyOwnerOfDecision = async (
  submission: SubmissionWithOwnerRecord
): Promise<void> => {
  const message = decisionMessageFor(submission);
  if (message) {
    await emailOne(submission.owner.email, message);
  }
};
