/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UNAPPROVED_SUBMISSION_STATUSES } from '@/lib/constants/submissions';

import { isUnsetOr } from './where-kit';

import type { Prisma } from '@prisma/client';

/**
 * Submission `where` fragments (ADR-0025). `status` and `listed` are non-null
 * with defaults, so they are matched by value. The owner's `banned` flag is
 * optional and is absent on most users, so "not banned" is false, null or
 * absent, the way the action gate reads it (a ban is `banned === true`).
 * Proved by `submission-where.contract.spec.ts`.
 */
export const submissionWhere = {
  /** No approver has approved it in its present form: a draft, awaiting approval, or rejected. */
  unapproved: { status: { in: [...UNAPPROVED_SUBMISSION_STATUSES] } },
  /** Published by its owner and not yet decided: the approvers' queue. */
  awaitingApproval: { status: 'AWAITING_APPROVAL' },
  /**
   * A public submission: approved, with an owner who is not banned. A ban
   * hides every submission its owner holds without changing any of them.
   */
  public: { status: 'APPROVED', owner: { is: isUnsetOr('banned', false) } },
} as const satisfies Record<string, Prisma.SubmissionWhereInput>;

/** The fields {@link isPublicSubmission} reads from a loaded row. */
export interface PublicSubmissionFields {
  status: string;
  owner: { banned?: boolean | null };
}

/**
 * Whether a loaded submission is a public submission: the predicate form of
 * `submissionWhere.public`, for a row a read has already fetched with its
 * owner. The contract spec proves the two agree.
 */
export const isPublicSubmission = ({ status, owner }: PublicSubmissionFields): boolean =>
  status === 'APPROVED' && owner.banned !== true;
