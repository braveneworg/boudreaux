/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { queuePositionMessage } from '@/lib/community/queue-position-message';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { SubmissionViewerKind } from '@/lib/types/domain/submission';

export interface SubmissionStatusStripProps {
  status: SubmissionStatus;
  viewer: SubmissionViewerKind;
  listed: boolean;
  isPublic: boolean;
  rejectionReason: string | null;
  /** How many are ahead in the queue; the owner's alone, while it awaits approval. */
  queuePosition: number | null;
}

const awaitingCopy = (viewer: SubmissionViewerKind, queuePosition: number | null): string =>
  viewer === 'owner' && queuePosition !== null
    ? `Awaiting approval. ${queuePositionMessage(queuePosition)}`
    : 'Awaiting approval. Nobody else can open it yet.';

const rejectedCopy = (viewer: SubmissionViewerKind, reason: string | null): string => {
  const stated = `Not approved, so it is offline. Reason: ${reason ?? 'none recorded.'}`;

  return viewer === 'owner' ? `${stated} Edit it and publish again.` : stated;
};

const approvedCopy = (isPublic: boolean, listed: boolean): string => {
  if (!isPublic) {
    return 'Approved, but hidden while its owner is suspended.';
  }

  return listed
    ? 'Approved and listed.'
    : 'Approved and unlisted: only people with the link can open it.';
};

/** What the strip says for a state, to this reader. */
const copyFor = ({
  status,
  viewer,
  listed,
  isPublic,
  rejectionReason,
  queuePosition,
}: SubmissionStatusStripProps): string => {
  if (status === 'DRAFT') {
    return 'Draft. Only you can see this.';
  }

  if (status === 'AWAITING_APPROVAL') {
    return awaitingCopy(viewer, queuePosition);
  }

  return status === 'REJECTED'
    ? rejectedCopy(viewer, rejectionReason)
    : approvedCopy(isPublic, listed);
};

/**
 * The line above a submission that tells its owner or an approver where it
 * stands: its state, a rejection's reason, and for the owner their queue
 * position while it awaits approval. A member of the public is shown nothing:
 * for them a submission is simply there or not.
 */
export const SubmissionStatusStrip = (props: SubmissionStatusStripProps) =>
  props.viewer === 'public' ? null : (
    <p
      role="status"
      className="border-foreground bg-background mb-4 border-2 px-3 py-2 text-sm font-medium"
    >
      {copyFor(props)}
    </p>
  );
