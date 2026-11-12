/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ATTACHMENT_MAX_VIDEO_SECONDS } from '@fakefour/job-contract';

import type {
  AttachmentState,
  SubmissionAttachmentRecord,
} from '@/lib/types/domain/submission-attachment';
import {
  resolveStaleJobView,
  STALE_JOB_TIMEOUT_MESSAGE,
  toAsyncJobStatus,
} from '@/utils/async-job-lifecycle';

/**
 * What an attachment's stored columns mean (ADR-0026): where its re-encode
 * stands, what an owner is told when it failed, whether a submission's
 * attachments are all fit to publish, and which one is its card picture.
 * Pure: no store, no database, safe on either side of the client boundary.
 */

/** The columns these rules read. */
export type AttachmentStateSource = Pick<
  SubmissionAttachmentRecord,
  | 'kind'
  | 'uploadKey'
  | 'copyKey'
  | 'cardKey'
  | 'posterKey'
  | 'reencodeStatus'
  | 'reencodeStartedAt'
  | 'reencodeError'
>;

const GENERIC_FAILURE =
  'Something went wrong while processing this file. Remove it and upload it again.';
const TIMED_OUT = 'Processing took too long. Remove it and upload it again.';

export const PROCESSING_MESSAGE = 'Wait until every attachment has finished processing.';
export const FAILED_MESSAGE = 'Remove the attachment that failed, or upload it again.';

/** What an owner reads for a failure. A reason it does not know is never shown raw. */
export const attachmentFailureCopy = (reason: string | null): string => {
  switch (reason) {
    case 'too-large':
      return 'This file is larger than we accept for its kind.';
    case 'too-long':
      return `This is longer than we accept. A video can be up to ${ATTACHMENT_MAX_VIDEO_SECONDS / 60} minutes.`;
    case 'unreadable':
      return "We couldn't read this file. It may be damaged.";
    case 'unsupported':
      return "We can't use this kind of file.";
    case STALE_JOB_TIMEOUT_MESSAGE:
      return TIMED_OUT;
    default:
      return GENERIC_FAILURE;
  }
};

/**
 * Where an attachment stands. A job past the stale window reads as failed,
 * as every async job does; so does one that never started, and one that
 * says it succeeded but left no copy.
 */
export const attachmentStateOf = ({
  copyKey,
  reencodeStatus,
  reencodeStartedAt,
  reencodeError,
}: Pick<
  AttachmentStateSource,
  'copyKey' | 'reencodeStatus' | 'reencodeStartedAt' | 'reencodeError'
>): { state: AttachmentState; error: string | null } => {
  const { status, error } = resolveStaleJobView({
    status: toAsyncJobStatus(reencodeStatus),
    startedAt: reencodeStartedAt,
    error: reencodeError,
  });

  if (status === 'succeeded' && copyKey !== null) {
    return { state: 'ready', error: null };
  }

  if (status === 'pending' || status === 'processing') {
    return { state: 'processing', error: null };
  }

  return { state: 'failed', error: attachmentFailureCopy(error) };
};

/**
 * What keeps a submission's attachments from being published or approved:
 * one failed, one still processing, or `null` when every one has its
 * re-encoded copy. A failure is named first, because waiting will not fix it.
 */
export const unreadyAttachmentState = (
  attachments: AttachmentStateSource[]
): Exclude<AttachmentState, 'ready'> | null => {
  const states = attachments.map((attachment) => attachmentStateOf(attachment).state);

  if (states.includes('failed')) {
    return 'failed';
  }

  return states.includes('processing') ? 'processing' : null;
};

/** {@link unreadyAttachmentState} as the owner is told it; `null` when all are ready. */
export const unreadyAttachmentsMessage = (attachments: AttachmentStateSource[]): string | null => {
  const unready = unreadyAttachmentState(attachments);

  if (unready === null) {
    return null;
  }

  return unready === 'failed' ? FAILED_MESSAGE : PROCESSING_MESSAGE;
};

/**
 * The card picture's private key: the first ready image, else the first
 * ready video, else none. Derived, never chosen by the owner.
 */
export const cardPictureOf = (attachments: AttachmentStateSource[]): string | null => {
  const pictured = attachments.filter(
    (attachment) => attachment.cardKey !== null && attachmentStateOf(attachment).state === 'ready'
  );
  const chosen =
    pictured.find(({ kind }) => kind === 'IMAGE') ?? pictured.find(({ kind }) => kind === 'VIDEO');

  return chosen?.cardKey ?? null;
};

/** Every file a re-encode wrote for an attachment, as private keys. */
export const attachmentFileKeys = ({
  copyKey,
  cardKey,
  posterKey,
}: Pick<AttachmentStateSource, 'copyKey' | 'cardKey' | 'posterKey'>): string[] =>
  [copyKey, cardKey, posterKey].filter((key): key is string => key !== null);
