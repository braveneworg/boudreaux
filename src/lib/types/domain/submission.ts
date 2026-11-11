/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SubmissionCategory, SubmissionStatus } from '@/lib/constants/submissions';
import type { DataErrorCode } from '@/lib/types/domain/errors';

/**
 * Domain types for community submissions (ADR-0025). The record types are the
 * repository's read models: each is bound to its Prisma `select` by a drift
 * guard in `submission-repository.ts`.
 */

/** The scalar fields of a stored submission. */
export interface SubmissionRecord {
  id: string;
  ownerId: string;
  title: string;
  category: SubmissionCategory;
  aboutHtml: string;
  writingHtml: string;
  links: string[];
  listed: boolean;
  status: SubmissionStatus;
  publishedAt: Date | null;
  firstApprovedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What a submission read carries of its owner. The email is for the server
 * alone (the avatar hash and the owner's notices) and never reaches a client.
 */
export interface SubmissionOwnerRecord {
  id: string;
  username: string | null;
  email: string;
  banned: boolean | null;
}

/** A submission with its owner. */
export interface SubmissionWithOwnerRecord extends SubmissionRecord {
  owner: SubmissionOwnerRecord;
}

/** The content of a submission: what an approver approves. `listed` is not content. */
export interface SubmissionContent {
  title: string;
  category: SubmissionCategory;
  aboutHtml: string;
  writingHtml: string;
  links: string[];
}

/** What the repository needs to create a submission. */
export interface CreateSubmissionData extends SubmissionContent {
  ownerId: string;
  listed: boolean;
  status: Extract<SubmissionStatus, 'DRAFT' | 'AWAITING_APPROVAL'>;
  publishedAt: Date | null;
}

/** What an owner's save may write on an existing submission. */
export interface UpdateSubmissionData extends SubmissionContent {
  listed: boolean;
  status: Extract<SubmissionStatus, 'DRAFT' | 'AWAITING_APPROVAL' | 'REJECTED'>;
  /** Set when the save publishes; left alone otherwise. */
  publishedAt?: Date;
}

/** What an approver's decision writes. */
export type SubmissionDecisionData =
  | {
      status: 'APPROVED';
      approvedAt: Date;
      approvedBy: string;
      /** Set only on the first approval; a re-approval never moves it. */
      firstApprovedAt?: Date;
    }
  | { status: 'REJECTED'; rejectedAt: Date; rejectedBy: string; rejectionReason: string };

/** What an owner-scoped write did. */
export type SubmissionWrite =
  | { status: 'written'; submission: SubmissionRecord }
  /** The owner already holds the most unapproved submissions allowed. */
  | { status: 'full' }
  /** No row matched: not this owner's, or no longer in the state the write expected. */
  | { status: 'stale' };

/** A queue an approver reads: every submission in one state. */
export interface SubmissionQueuePage {
  submissions: SubmissionWithOwnerRecord[];
  total: number;
}

/** The codes a submission Server Action can fail with. */
export type SubmissionActionCode = DataErrorCode | 'UNAUTHENTICATED' | 'BANNED' | 'FORBIDDEN';

/** Field name to the messages shown on it. `_form` holds messages for no one field. */
export type SubmissionFieldErrors = Record<string, string[]>;

/**
 * What a submission Server Action returns. A failure carries the stable code
 * to branch on and the copy to show, the split ADR-0001 gives `ServiceResponse`.
 */
export type SubmissionActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      code: SubmissionActionCode;
      fieldErrors?: SubmissionFieldErrors;
    };
