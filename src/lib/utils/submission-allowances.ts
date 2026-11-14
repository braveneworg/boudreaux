/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { spendDailyAllowance, type DailyAllowanceTier } from './daily-allowance';

/**
 * What one owner may cost the label in a day. Anyone signed in may submit,
 * so the per-submission caps (five unapproved submissions, ten attachments)
 * bound what an owner holds at once, not what they can churn through by
 * publishing and deleting. These bound the churn. Each is a rolling 24
 * hours, keyed by the owner's account.
 */

/**
 * How many times a day one owner's publishing emails and texts the
 * approvers. Past it a publish still succeeds and the submission is in the
 * queue like any other; it only stops notifying, so one account cannot make
 * every approver's phone buzz without end. Five is the most unapproved
 * submissions an owner can hold.
 */
export const APPROVER_NOTICES_PER_OWNER = 5;

/**
 * How many files a day one owner may upload. Every upload runs a re-encode,
 * so this is what bounds an account's cost there. A hundred is ten full
 * submissions' worth.
 */
export const ATTACHMENT_UPLOADS_PER_OWNER = 100;

const APPROVER_NOTICE: DailyAllowanceTier = {
  name: 'submission:approver-notice',
  limit: APPROVER_NOTICES_PER_OWNER,
};
const ATTACHMENT_UPLOAD: DailyAllowanceTier = {
  name: 'submission:attachment-upload',
  limit: ATTACHMENT_UPLOADS_PER_OWNER,
};

/** Deterministic Playwright runs must not trip production-grade limits. */
const isE2E = (): boolean => process.env.E2E_MODE === 'true';

/**
 * Whether approvers may be told about one more submission of this owner's
 * entering the queue today, and if so, count it.
 */
export const allowApproverNotice = async (ownerId: string): Promise<boolean> =>
  isE2E() || spendDailyAllowance(APPROVER_NOTICE, ownerId);

/** Whether this owner may upload one more file today, and if so, count it. */
export const allowAttachmentUpload = async (ownerId: string): Promise<boolean> =>
  isE2E() || spendDailyAllowance(ATTACHMENT_UPLOAD, ownerId);
