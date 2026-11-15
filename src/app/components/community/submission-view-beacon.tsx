/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useSubmissionViewBeacon } from './use-submission-view-beacon';

export interface SubmissionViewBeaconProps {
  /** The submission that was opened. */
  submissionId: string;
}

/**
 * What makes opening a submission a view (CONTEXT.md): it renders nothing
 * and, once mounted in a browser, asks the server to count the opening. The
 * submission modal mounts it with the submission it shows. A deep link that
 * is only rendered, by a link preview or a crawler, never opens the modal
 * and is never a view.
 *
 * The modal renders it only for a reader who can be counted. The server
 * holds the same rule; leaving it out for an owner or an approver only
 * saves the request.
 */
export const SubmissionViewBeacon = ({ submissionId }: SubmissionViewBeaconProps) => {
  useSubmissionViewBeacon(submissionId);

  return null;
};
