/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SubmissionCategory, SubmissionStatus } from '@/lib/constants/submissions';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type { AttachmentView } from '@/lib/types/domain/submission-attachment';

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
  /** The about as plain text, for the search; `null` on a row saved before it was kept. */
  aboutText: string | null;
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

/**
 * Whose a submission is and whether the public may open it, and nothing of
 * its content: what counting a view reads (ADR-0029).
 */
export interface SubmissionStandingRecord {
  ownerId: string;
  status: SubmissionStatus;
  owner: { banned: boolean | null };
}

/**
 * A listed submission as the community page reads it, before it is made into
 * a card. The owner's email is for the avatar hash and never reaches a client.
 */
export interface ListedSubmissionRecord {
  id: string;
  title: string;
  category: SubmissionCategory;
  owner: { username: string | null; email: string };
}

/**
 * A listed submission as a card shows it, on the community page, in its
 * search and in one user's list. Safe for any reader: it holds the owner's
 * avatar hash, never their email, and a picture only the CDN serves.
 */
export interface SubmissionCard {
  id: string;
  title: string;
  category: SubmissionCategory;
  /** Its card picture's CDN address, or `null` when it has none. */
  cardPictureUrl: string | null;
  owner: { username: string | null; gravatarHash: string };
}

/** The account a per-user list is for. */
export interface SubmissionOwnerName {
  id: string;
  username: string;
}

/** Which listed submissions a read wants: one page, optionally narrowed. */
export interface ListedSubmissionsQuery {
  skip: number;
  take: number;
  /** A search term; the title, the about text and the username are read. */
  search?: string;
  /** Only this owner's. */
  ownerId?: string;
}

/** The content of a submission: what an approver approves. `listed` is not content. */
export interface SubmissionContent {
  title: string;
  category: SubmissionCategory;
  aboutHtml: string;
  writingHtml: string;
  links: string[];
}

/**
 * The content as a write stores it: with the about's plain text beside its
 * HTML, derived by the service and never sent by a client.
 */
export interface StoredSubmissionContent extends SubmissionContent {
  aboutText: string;
}

/** What the repository needs to create a submission. */
export interface CreateSubmissionData extends StoredSubmissionContent {
  ownerId: string;
  listed: boolean;
  status: Extract<SubmissionStatus, 'DRAFT' | 'AWAITING_APPROVAL'>;
  publishedAt: Date | null;
}

/** What an owner's save may write on an existing submission. */
export interface UpdateSubmissionData extends StoredSubmissionContent {
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

/** Who is acting on or reading a submission: the session's user, or nobody. */
export interface SubmissionActor {
  id: string;
  role: string | null;
}

/** The owner as a save needs them: who they are and which agreement they hold. */
export interface SubmissionOwnerActor {
  id: string;
  uploadAgreementVersion: number | null;
}

/** How a reader stands to the submission they opened. */
export type SubmissionViewerKind = 'owner' | 'approver' | 'public';

/**
 * What a reader is shown of a submission they opened. Built for one reader:
 * it exists only when that reader may open the submission, and it never
 * carries the owner's email.
 */
export interface SubmissionView extends SubmissionContent {
  id: string;
  ownerId: string;
  listed: boolean;
  status: SubmissionStatus;
  rejectionReason: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  owner: { username: string | null; gravatarHash: string };
  viewer: SubmissionViewerKind;
  /** Whether the public may open it right now: approved, owner not banned. */
  isPublic: boolean;
  /** How many are ahead of it in the queue; set for its owner while it awaits approval. */
  queuePosition: number | null;
  /** Its attachments, in upload order, with the addresses this reader may use. */
  attachments: AttachmentView[];
}

/**
 * A reader's view as it leaves the server for the submission modal
 * (ADR-0030): what a screen shows, without the owner's id and the dates,
 * which no screen reads.
 */
export type SubmissionViewPayload = Omit<SubmissionView, 'ownerId' | 'publishedAt' | 'updatedAt'>;

/** One row of an approver's queue. */
export interface SubmissionQueueRow {
  id: string;
  title: string;
  category: SubmissionCategory;
  listed: boolean;
  status: SubmissionStatus;
  ownerUsername: string | null;
  publishedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  updatedAt: Date;
}

/** What a save or a decision hands back to the screen that asked for it. */
export interface SavedSubmission {
  id: string;
  status: SubmissionStatus;
  listed: boolean;
  /** How many are ahead of it in the queue, when the write left it awaiting approval. */
  queuePosition: number | null;
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
