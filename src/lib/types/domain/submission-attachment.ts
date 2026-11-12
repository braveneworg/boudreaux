/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { Json } from '@/lib/types/domain/shared';

import type { AttachmentKind, ReencodeProgressStage } from '@fakefour/job-contract';

/**
 * Domain types for a submission's attachments (ADR-0026, ADR-0027). The
 * record types are the repository's read models: each is bound to its Prisma
 * payload by a drift guard in `submission-attachment-repository.ts`.
 */

/** The scalar fields of a stored attachment. Every key is a private-bucket key. */
export interface SubmissionAttachmentRecord {
  id: string;
  submissionId: string;
  kind: AttachmentKind;
  fileName: string;
  uploadKey: string;
  uploadBytes: number;
  uploadType: string;
  copyKey: string | null;
  cardKey: string | null;
  posterKey: string | null;
  copyBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  reencodeStatus: string | null;
  reencodeError: string | null;
  reencodeStartedAt: Date | null;
  reencodeJobToken: string | null;
  reencodeProgress: Json | null;
  createdAt: Date;
}

/** What an attachment read carries of the submission it belongs to. */
export interface AttachmentSubmissionRecord {
  id: string;
  ownerId: string;
  status: SubmissionStatus;
}

/** An attachment with the submission it belongs to. */
export interface AttachmentWithSubmissionRecord extends SubmissionAttachmentRecord {
  submission: AttachmentSubmissionRecord;
}

/** What the repository needs to create an attachment. */
export interface CreateAttachmentData {
  submissionId: string;
  kind: AttachmentKind;
  fileName: string;
  uploadKey: string;
  uploadBytes: number;
  uploadType: string;
}

/** What creating an attachment did. */
export type AttachmentCreate =
  | { status: 'created'; attachment: SubmissionAttachmentRecord }
  /** The submission already holds the most attachments allowed. */
  | { status: 'full' };

/** What a successful re-encode wrote, as the attachment stores it. */
export interface ReencodedAttachmentData {
  kind: AttachmentKind;
  copyKey: string;
  cardKey: string | null;
  posterKey: string | null;
  copyBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

/** Where an attachment stands, as a screen shows it. */
export type AttachmentState = 'processing' | 'ready' | 'failed';

/** A stored re-encode checkpoint, as the status view surfaces it. */
export interface AttachmentProgress {
  stage: ReencodeProgressStage;
  percent?: number;
  at: string;
}

/**
 * One attachment as a screen shows it, built for one reader. The URLs are CDN
 * addresses on a public submission and short-lived signed links otherwise;
 * all are `null` until the re-encoded copy exists.
 */
export interface AttachmentView {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  state: AttachmentState;
  /** Why it failed, written for the owner; `null` unless it failed. */
  error: string | null;
  /** The latest checkpoint while it is processing. */
  progress: AttachmentProgress | null;
  url: string | null;
  cardUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}
